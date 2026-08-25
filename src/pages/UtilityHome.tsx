import { Link } from "react-router-dom";
import { ScanLine, FileText, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function UtilityHome() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4">
        <h1 className="text-2xl font-display font-bold brass-text text-center mb-4">{t("viewer.quickTools")}</h1>
        <Link to="/scan" className="block">
          <Button className="w-full brass-gradient text-primary-foreground h-14 text-base">
            <ScanLine className="h-5 w-5 mr-2" /> {t("viewer.scanDocument")}
          </Button>
        </Link>
        <Link to="/view" className="block">
          <Button variant="outline" className="w-full h-14 text-base">
            <FileText className="h-5 w-5 mr-2" /> {t("viewer.openViewFile")}
          </Button>
        </Link>
        <Link to="/locker" className="block">
          <Button variant="outline" className="w-full h-14 text-base">
            <KeyRound className="h-5 w-5 mr-2" /> {t("viewer.goToSecureVault")}
          </Button>
        </Link>
      </div>
    </div>
  );
}
