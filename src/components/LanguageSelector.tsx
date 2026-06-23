import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check, RotateCcw, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
} from "@/i18n";

interface LanguageSelectorProps {
  /** Compact header trigger (icon + short label) */
  compact?: boolean;
}

/**
 * Language picker dialog.
 * - Prominent "Default English" pill at the top so users who pick an
 *   unfamiliar script can always restore English without reading anything.
 * - Grid of 12 supported languages with flag + native name.
 */
const LanguageSelector = ({ compact = true }: LanguageSelectorProps) => {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentCode = (i18n.resolvedLanguage || i18n.language || DEFAULT_LANGUAGE)
    .split("-")[0];
  const current =
    SUPPORTED_LANGUAGES.find((l) => l.code === currentCode) ??
    SUPPORTED_LANGUAGES[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    toast.success(t("lang.changed"));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground hover:bg-secondary shrink-0 px-2"
          title={t("lang.title")}
          aria-label={t("lang.title")}
        >
          <Globe className="h-4 w-4 mr-1.5" />
          <span className="text-xs">
            <span aria-hidden className="mr-1">{current.flag}</span>
            {compact ? current.code.toUpperCase() : current.name}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            {t("lang.title")}
          </DialogTitle>
          <DialogDescription>
            {t("lang.current")}:{" "}
            <span className="font-medium text-foreground">
              {current.flag} {current.name}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Permanent Default-English restore — kept visually distinct so it's
            recoverable even if the UI is in a script the user cannot read. */}
        <Button
          onClick={() => changeLanguage(DEFAULT_LANGUAGE)}
          className="w-full brass-gradient text-primary-foreground hover:opacity-90 font-display"
          size="lg"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          🇬🇧 {t("lang.restoreDefault")}
        </Button>

        <div className="mt-2 mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("lang.choose")}
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto pr-1">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const active = lang.code === currentCode;
            return (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40 hover:bg-secondary"
                }`}
                aria-pressed={active}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden>
                    {lang.flag}
                  </span>
                  <span className="truncate text-sm text-foreground">
                    {lang.name}
                  </span>
                </span>
                {active && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LanguageSelector;
