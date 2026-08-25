import { motion } from "framer-motion";
import { Lock, Unlock, FileText } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface DrawerCardProps {
  name: string;
  icon: string;
  documentCount: number;
  onClick: () => void;
  index: number;
}

const DrawerCard = ({ name, icon, documentCount, onClick, index }: DrawerCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      whileHover={{ y: -4 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={onClick}
      className="cursor-pointer"
    >
      <div className="wood-panel rounded-lg overflow-hidden border border-border transition-all duration-300 hover:border-brass/50">
        {/* Drawer top edge */}
        <div className="h-1.5 brass-gradient" />
        
        <div className="p-5 relative">
          {/* Wood grain overlay */}
          <div className="absolute inset-0 opacity-10 bg-gradient-to-br from-foreground/5 to-transparent" />
          
          {/* Brass handle */}
          <div className="flex justify-center mb-4">
            <motion.div
              animate={isHovered ? { scale: 1.1, y: -2 } : { scale: 1, y: 0 }}
              className="brass-gradient rounded-full px-8 py-1.5 shadow-lg relative"
            >
              <div className="absolute inset-0 rounded-full opacity-50" 
                   style={{ boxShadow: "inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.3)" }} />
            </motion.div>
          </div>

          {/* Lock icon */}
          <div className="flex justify-center mb-3">
            <motion.div
              animate={isHovered ? { rotate: -15 } : { rotate: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              {isHovered ? (
                <Unlock className="h-5 w-5 text-primary" />
              ) : (
                <Lock className="h-5 w-5 text-muted-foreground" />
              )}
            </motion.div>
          </div>

          {/* Drawer label */}
          <div className="text-center relative z-10">
            <div className="bg-card/80 backdrop-blur-sm rounded px-3 py-2 inline-block border border-border/50">
              <span className="text-lg mr-1">{icon}</span>
              <span className="font-display font-semibold text-sm text-foreground">{name}</span>
            </div>
          </div>

          {/* Document count */}
          <div className="flex items-center justify-center gap-1 mt-3 text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span className="text-xs">{t("vault.documents", { count: documentCount })}</span>
          </div>
        </div>

        {/* Bottom edge */}
        <div className="h-1 bg-wood-dark" />
      </div>
    </motion.div>
  );
};

export default DrawerCard;
