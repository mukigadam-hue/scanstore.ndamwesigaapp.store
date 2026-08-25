import { useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

export interface Country {
  name: string;
  code: string; // ISO-2
  dial: string; // e.g. +256
  flag: string; // emoji
}

// Compact list of common countries (extend as needed)
export const COUNTRIES: Country[] = [
  { name: "Uganda", code: "UG", dial: "+256", flag: "🇺🇬" },
  { name: "Kenya", code: "KE", dial: "+254", flag: "🇰🇪" },
  { name: "Tanzania", code: "TZ", dial: "+255", flag: "🇹🇿" },
  { name: "Rwanda", code: "RW", dial: "+250", flag: "🇷🇼" },
  { name: "Nigeria", code: "NG", dial: "+234", flag: "🇳🇬" },
  { name: "Ghana", code: "GH", dial: "+233", flag: "🇬🇭" },
  { name: "South Africa", code: "ZA", dial: "+27", flag: "🇿🇦" },
  { name: "Egypt", code: "EG", dial: "+20", flag: "🇪🇬" },
  { name: "Ethiopia", code: "ET", dial: "+251", flag: "🇪🇹" },
  { name: "United States", code: "US", dial: "+1", flag: "🇺🇸" },
  { name: "United Kingdom", code: "GB", dial: "+44", flag: "🇬🇧" },
  { name: "Canada", code: "CA", dial: "+1", flag: "🇨🇦" },
  { name: "Germany", code: "DE", dial: "+49", flag: "🇩🇪" },
  { name: "France", code: "FR", dial: "+33", flag: "🇫🇷" },
  { name: "Spain", code: "ES", dial: "+34", flag: "🇪🇸" },
  { name: "Italy", code: "IT", dial: "+39", flag: "🇮🇹" },
  { name: "Netherlands", code: "NL", dial: "+31", flag: "🇳🇱" },
  { name: "Sweden", code: "SE", dial: "+46", flag: "🇸🇪" },
  { name: "United Arab Emirates", code: "AE", dial: "+971", flag: "🇦🇪" },
  { name: "Saudi Arabia", code: "SA", dial: "+966", flag: "🇸🇦" },
  { name: "India", code: "IN", dial: "+91", flag: "🇮🇳" },
  { name: "Pakistan", code: "PK", dial: "+92", flag: "🇵🇰" },
  { name: "Bangladesh", code: "BD", dial: "+880", flag: "🇧🇩" },
  { name: "China", code: "CN", dial: "+86", flag: "🇨🇳" },
  { name: "Japan", code: "JP", dial: "+81", flag: "🇯🇵" },
  { name: "South Korea", code: "KR", dial: "+82", flag: "🇰🇷" },
  { name: "Singapore", code: "SG", dial: "+65", flag: "🇸🇬" },
  { name: "Australia", code: "AU", dial: "+61", flag: "🇦🇺" },
  { name: "Brazil", code: "BR", dial: "+55", flag: "🇧🇷" },
  { name: "Mexico", code: "MX", dial: "+52", flag: "🇲🇽" },
  { name: "Argentina", code: "AR", dial: "+54", flag: "🇦🇷" },
];

// Best-effort detection via timezone
function detectCountryCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const map: Record<string, string> = {
      "Africa/Kampala": "UG",
      "Africa/Nairobi": "KE",
      "Africa/Dar_es_Salaam": "TZ",
      "Africa/Kigali": "RW",
      "Africa/Lagos": "NG",
      "Africa/Accra": "GH",
      "Africa/Johannesburg": "ZA",
      "Africa/Cairo": "EG",
      "Africa/Addis_Ababa": "ET",
      "America/New_York": "US",
      "America/Los_Angeles": "US",
      "America/Chicago": "US",
      "America/Toronto": "CA",
      "Europe/London": "GB",
      "Europe/Berlin": "DE",
      "Europe/Paris": "FR",
      "Europe/Madrid": "ES",
      "Europe/Rome": "IT",
      "Europe/Amsterdam": "NL",
      "Asia/Dubai": "AE",
      "Asia/Riyadh": "SA",
      "Asia/Kolkata": "IN",
      "Asia/Karachi": "PK",
      "Asia/Dhaka": "BD",
      "Asia/Shanghai": "CN",
      "Asia/Tokyo": "JP",
      "Asia/Seoul": "KR",
      "Asia/Singapore": "SG",
      "Australia/Sydney": "AU",
      "America/Sao_Paulo": "BR",
      "America/Mexico_City": "MX",
    };
    return map[tz] || "UG";
  } catch {
    return "UG";
  }
}

interface Props {
  value: Country;
  onChange: (c: Country) => void;
}

export function CountryCodePicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 h-11 px-3 rounded-md border border-border bg-input text-foreground hover:bg-secondary transition-colors"
        >
          <span className="text-lg">{value.flag}</span>
          <span className="text-sm font-medium">{value.dial}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={t("auth.searchCountry")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.code + c.dial}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
                setQuery("");
              }}
              className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-secondary text-left"
            >
              <span className="text-lg">{c.flag}</span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-muted-foreground">{c.dial}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              {t("auth.noMatches")}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function useDetectedCountry(): Country {
  const [country, setCountry] = useState<Country>(() => COUNTRIES[0]);
  useEffect(() => {
    const code = detectCountryCode();
    const found = COUNTRIES.find((c) => c.code === code);
    if (found) setCountry(found);
  }, []);
  return country;
}
