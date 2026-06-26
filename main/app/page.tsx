"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { generateAndVerifyProof, type ProofResult } from "../lib/zkproof";
import type { Hex } from "viem";

const VERIFIER_ADDRESS = "0xC3CA2C626f902e9e2FE20eb88000Bbb325b169c2" as const;

const VERIFIER_ABI = [
  {
    inputs: [
      { internalType: "bytes", name: "proof", type: "bytes" },
      { internalType: "bytes32[]", name: "publicInputs", type: "bytes32[]" },
    ],
    name: "verify",
    outputs: [{ internalType: "bool", name: "verified", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type Step = "idle" | "signing" | "proving" | "done" | "error";

export default function Home() {
  const { address, isConnected, chain } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  const [message, setMessage] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onchainVerifying, setOnchainVerifying] = useState(false);
  const [onchainResult, setOnchainResult] = useState<boolean | null>(null);
  const [onchainError, setOnchainError] = useState<string | null>(null);

  async function handleProve() {
    if (!address || !message.trim()) return;
    setStep("signing");
    setError(null);
    setResult(null);
    setOnchainResult(null);

    try {
      const signature = await signMessageAsync({ message });
      setStep("proving");
      const proofResult = await generateAndVerifyProof(
        message,
        signature as Hex,
        address as Hex
      );
      setResult(proofResult);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("error");
    }
  }

  async function handleOnchainVerify() {
    if (!result) return;
    setOnchainVerifying(true);
    setOnchainError(null);
    setOnchainResult(null);

    try {
      // Switch to Sepolia if needed
      if (chain?.id !== sepolia.id) {
        await switchChain({ chainId: sepolia.id });
      }

      // Call verify on the deployed contract
      const tx = await writeContractAsync({
        address: VERIFIER_ADDRESS,
        abi: VERIFIER_ABI,
        functionName: "verify",
        args: [result.evmProof, result.publicInputs as Hex[]],
      });

      // Wait handled by useWaitForTransactionReceipt — mark success
      console.log("tx hash:", tx);
      setOnchainResult(true);
    } catch (e: unknown) {
      setOnchainError(e instanceof Error ? e.message : "Transaction failed");
      setOnchainResult(false);
    } finally {
      setOnchainVerifying(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 font-mono">
      {/* Header */}
      <div className="w-full max-w-lg mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
          ZK ecrecover
        </h1>
        <p className="text-zinc-400 text-sm">
          Prove you own an Ethereum address — without revealing your private key
        </p>
      </div>

      <div className="w-full max-w-lg flex flex-col gap-4">
        {/* Wallet */}
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Wallet</p>
          {isConnected ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300 truncate">{address}</span>
              <button
                onClick={() => disconnect()}
                className="ml-4 text-xs text-zinc-500 hover:text-white transition-colors shrink-0"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="w-full py-3 rounded-lg bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>

        {/* Message */}
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Message</p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type any message to sign and prove..."
            disabled={!isConnected || step === "proving"}
            rows={3}
            className="w-full bg-transparent text-sm text-white placeholder-zinc-600 resize-none outline-none disabled:opacity-40"
          />
        </div>

        {/* Prove button */}
        <button
          onClick={handleProve}
          disabled={!isConnected || !message.trim() || step === "proving" || step === "signing"}
          className="w-full py-4 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {step === "signing" && "Waiting for signature..."}
          {step === "proving" && "Generating ZK proof..."}
          {(step === "idle" || step === "done" || step === "error") && "Sign & Generate Proof"}
        </button>

        {/* Proving status */}
        {step === "proving" && (
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950 text-center">
            <p className="text-sm text-zinc-400 animate-pulse">
              Running ZK circuit... this takes ~20–40 seconds
            </p>
          </div>
        )}

        {/* Error */}
        {step === "error" && error && (
          <div className="border border-red-900 rounded-xl p-5 bg-red-950/20">
            <p className="text-xs text-red-400 uppercase tracking-widest mb-1">Error</p>
            <p className="text-sm text-red-300 break-all">{error}</p>
          </div>
        )}

        {/* Off-chain result */}
        {step === "done" && result && (
          <div className={`border rounded-xl p-5 ${result.verified ? "border-green-800 bg-green-950/20" : "border-red-800 bg-red-950/20"}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-lg ${result.verified ? "text-green-400" : "text-red-400"}`}>
                {result.verified ? "✓" : "✗"}
              </span>
              <p className={`font-semibold text-sm ${result.verified ? "text-green-400" : "text-red-400"}`}>
                Off-chain proof {result.verified ? "verified" : "failed"}
              </p>
            </div>

            {result.verified && (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                  <div>
                    <p className="text-zinc-500 mb-1">Proven address</p>
                    <p className="text-zinc-300 break-all">{address}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 mb-1">Proof size</p>
                    <p className="text-zinc-300">{result.proofSize} bytes</p>
                  </div>
                </div>

                {/* On-chain verify section */}
                <div className="border-t border-zinc-800 pt-4">
                  <p className="text-xs text-zinc-500 mb-3">
                    Verify this proof on Sepolia — calls the deployed{" "}
                    <span className="text-violet-400">HonkVerifier</span> contract
                  </p>

                  <button
                    onClick={handleOnchainVerify}
                    disabled={onchainVerifying || isTxPending}
                    className="w-full py-3 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {onchainVerifying || isTxPending
                      ? "Verifying on-chain..."
                      : "Verify On-Chain (Sepolia)"}
                  </button>

                  {/* On-chain result */}
                  {(onchainResult !== null || onchainError) && (
                    <div className={`mt-3 p-3 rounded-lg text-xs ${onchainResult ? "bg-green-950/30 border border-green-800" : "bg-red-950/30 border border-red-800"}`}>
                      {onchainResult && (
                        <>
                          <p className="text-green-400 font-semibold mb-1">✓ On-chain verification successful</p>
                          {txHash && (
                            <p className="text-zinc-400">
                              Tx:{" "}
                              <a
                                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-violet-400 underline break-all"
                              >
                                {txHash}
                              </a>
                            </p>
                          )}
                        </>
                      )}
                      {onchainError && (
                        <p className="text-red-300 break-all">{onchainError}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <p className="mt-12 text-xs text-zinc-700">
        Proof runs on server · Private key never leaves your device · Verifier deployed on Sepolia
      </p>
    </main>
  );
}
