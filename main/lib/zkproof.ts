import type { Hex } from "viem";

export type ProofResult = {
  verified: boolean;
  proofSize: number;
  evmProof: Hex;
  publicInputs: Hex[];
};

export async function generateAndVerifyProof(
  message: string,
  signature: Hex,
  address: Hex
): Promise<ProofResult> {
  const res = await fetch("/api/prove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature, address }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error ?? "Proof generation failed");
  }

  return data as ProofResult;
}
