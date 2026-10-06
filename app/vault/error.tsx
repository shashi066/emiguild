'use client';
export default function VaultError({ reset }: { reset: () => void }) {
  return <div className="container page-wrapper" role="alert"><h1>Your Vault couldn’t be opened</h1><button className="btn btn-primary" onClick={reset}>Try again</button></div>;
}
