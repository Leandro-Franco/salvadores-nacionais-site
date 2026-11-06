"use client";

import { useRef } from "react";

const HeartIcon = () => (
  <svg aria-hidden="true" className="size-7 sm:size-9" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 21s-9-5.8-9-12a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.2-9 12-9 12Z" />
  </svg>
);

const pillClass = "pill px-7 py-3 text-2xl sm:px-10 sm:py-4 sm:text-4xl";

/**
 * Links to the official donation channel when there is one; otherwise opens a
 * dialog saying it is not available yet (no money is collected by this site).
 */
export function DonationButton({ href, pendingText }: { href: string | null; pendingText: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  if (href) {
    return (
      <a href={href} rel="noopener noreferrer" className={pillClass}>
        <HeartIcon />
        Fazer doação
      </a>
    );
  }

  return (
    <>
      <button type="button" className={pillClass} onClick={() => dialog.current?.showModal()}>
        <HeartIcon />
        Fazer doação
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="donation-title"
        className="m-auto w-[90%] max-w-md rounded-xl border border-white bg-black p-8 text-white backdrop:bg-black/75"
      >
        <h2 id="donation-title" className="font-script text-4xl">
          Fazer doação
        </h2>
        <p className="mt-5 text-white/80">{pendingText}</p>
        <form method="dialog">
          <button className="pill mt-7 px-8 py-2 text-2xl">Entendi</button>
        </form>
      </dialog>
    </>
  );
}
