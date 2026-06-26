import { NextRequest, NextResponse } from "next/server";
import { hashMessage, recoverPublicKey } from "viem";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Hex } from "viem";

function hexToBytes(hex: string, expectedLen: number): number[] {
  const clean = hex.replace("0x", "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }
  if (bytes.length !== expectedLen) {
    throw new Error(`Expected ${expectedLen} bytes, got ${bytes.length}`);
  }
  return bytes;
}

function toTomlArray(arr: number[]): string {
  return "[" + arr.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ") + "]";
}

// Path to the circuit project
const CIRCUIT_DIR = join(process.cwd(), "..", "circuit");

export async function POST(req: NextRequest) {
  // Create a unique temp dir for this request
  const tmpDir = join(tmpdir(), `zkprove-${Date.now()}`);

  try {
    const { message, signature, address } = await req.json();

    if (!message || !signature || !address) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Recover public key
    const msgHash = hashMessage(message);
    const pubKeyHex = await recoverPublicKey({
      hash: msgHash as Hex,
      signature: signature as Hex,
    });

    const pubKeyBytes = hexToBytes(pubKeyHex, 65);
    const pub_key_x = pubKeyBytes.slice(1, 33);
    const pub_key_y = pubKeyBytes.slice(33, 65);
    const sigBytes = hexToBytes(signature, 65);
    const sig64 = sigBytes.slice(0, 64);
    const hashed_message = hexToBytes(msgHash, 32);
    const expected_address = hexToBytes(address, 20);

    // Write Prover.toml into the circuit dir
    const proverToml = `pub_key_x = ${toTomlArray(pub_key_x)}
pub_key_y = ${toTomlArray(pub_key_y)}
signature = ${toTomlArray(sig64)}
hashed_message = ${toTomlArray(hashed_message)}
expected_address = ${toTomlArray(expected_address)}
`;
    writeFileSync(join(CIRCUIT_DIR, "Prover.toml"), proverToml);

    // Create temp dirs for proof output
    mkdirSync(tmpDir, { recursive: true });
    const proofsDir = join(tmpDir, "proofs");
    mkdirSync(proofsDir);

    const circuitJson = join(CIRCUIT_DIR, "target", "main_zkecrecover.json");
    const vkPath = join(CIRCUIT_DIR, "target", "vk", "vk");
    const witnessPath = join(CIRCUIT_DIR, "target", "main_zkecrecover.gz");

    const NARGO = "/Users/apple/.nargo/bin/nargo";
    const BB = "/Users/apple/.bb/bb";

    // Step 1: Generate witness
    execSync(`${NARGO} execute`, { cwd: CIRCUIT_DIR, timeout: 30000 });

    // Step 2: Generate proof
    execSync(
      `${BB} prove -b ${circuitJson} -w ${witnessPath} -o ${proofsDir} -k ${vkPath}`,
      { timeout: 120000 }
    );

    // Step 3: Verify proof
    const verifyOut = execSync(
      `${BB} verify -k ${vkPath} -p ${proofsDir}/proof -i ${proofsDir}/public_inputs`,
      { timeout: 30000 }
    ).toString();

    const verified = verifyOut.includes("successfully") || verifyOut.trim() === "";

    return NextResponse.json({ verified, proofSize: 2144 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  }
}
