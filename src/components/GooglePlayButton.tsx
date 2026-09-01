import { cn } from "@/lib/utils";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.scanstore.app";

const GooglePlayLogo = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92z" fill="#4285F4" />
    <path d="M15.316 13.067l4.558 4.558a1.5 1.5 0 0 0 2.126-2.126l-4.558-4.558-2.126 2.126z" fill="#FBBC05" />
    <path d="M15.316 10.933l2.126-2.126 4.558-4.558A1.5 1.5 0 0 0 19.874 2.123l-4.558 4.558-2.126 2.126 2.126 2.126z" fill="#EA4335" />
    <path d="M4.219 23.624l9.573-9.573 2.126 2.126-8.51 8.51a1.5 1.5 0 0 1-2.126-2.126l-.063-.063.063-.063.937-.811z" fill="#34A853" />
    <path d="M4.219.376l.063-.063-.063-.063a1.5 1.5 0 0 1 2.126-2.126l8.51 8.51-2.126 2.126L4.219.376z" fill="#EA4335" />
  </svg>
);

type GooglePlayButtonProps = {
  label?: string;
  className?: string;
};

export const GooglePlayButton = ({ label = "Check updates on Google Play", className }: GooglePlayButtonProps) => (
  <a
    href={PLAY_STORE_URL}
    target="_blank"
    rel="noopener noreferrer"
    className={cn(
      "inline-flex items-center justify-center gap-3 rounded-full px-5 py-3",
      "bg-[#1f1f1f] text-white shadow-lg border border-white/10",
      "hover:bg-[#2a2a2a] hover:scale-[1.02] active:scale-[0.98]",
      "transition-transform duration-150 ease-out",
      className
    )}
  >
    <GooglePlayLogo className="h-6 w-6 shrink-0" />
    <span className="font-semibold text-sm sm:text-base whitespace-nowrap">
      {label}
    </span>
  </a>
);

export default GooglePlayButton;
