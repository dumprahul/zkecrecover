"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { generateAndVerifyProof, type ProofResult } from "../lib/zkproof";
import type { Hex } from "viem";

type Step = "idle" | "signing" | "proving" | "done" | "error";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [message, setMessage] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleProve() {
    if (!address || !message.trim()) return;
    setStep("signing");
    setError(null);
    setResult(null);

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
        {/* Wallet connect */}
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
            Wallet
          </p>
          {isConnected ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300 truncate">
                {address}
              </span>
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

        {/* Message input */}
        <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">
            Message
          </p>
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

        {/* Status / Result */}
        {step === "proving" && (
          <div className="border border-zinc-800 rounded-xl p-5 bg-zinc-950 text-center">
            <p className="text-sm text-zinc-400 animate-pulse">
              Running ZK circuit in browser... this takes ~10–20 seconds
            </p>
          </div>
        )}

        {step === "error" && error && (
          <div className="border border-red-900 rounded-xl p-5 bg-red-950/20">
            <p className="text-xs text-red-400 uppercase tracking-widest mb-1">Error</p>
            <p className="text-sm text-red-300 break-all">{error}</p>
          </div>
        )}

        {step === "done" && result && (
          <div className={`border rounded-xl p-5 ${result.verified ? "border-green-800 bg-green-950/20" : "border-red-800 bg-red-950/20"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-lg ${result.verified ? "text-green-400" : "text-red-400"}`}>
                {result.verified ? "✓" : "✗"}
              </span>
              <p className={`font-semibold text-sm ${result.verified ? "text-green-400" : "text-red-400"}`}>
                {result.verified ? "Proof verified successfully" : "Proof verification failed"}
              </p>
            </div>
            {result.verified && (
              <>
                <p className="text-xs text-zinc-500 mb-1">Proven address</p>
                <p className="text-xs text-zinc-300 break-all mb-3">{address}</p>
                <p className="text-xs text-zinc-500 mb-1">Proof size</p>
                <p className="text-xs text-zinc-300">{result.proofSize} bytes</p>
              </>
            )}
          </div>
        )}
      </div>

      <p className="mt-12 text-xs text-zinc-700">
        Proof runs entirely in your browser · No private key ever leaves your device
      </p>
    </main>
  );
}
