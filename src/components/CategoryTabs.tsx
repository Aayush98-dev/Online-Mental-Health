import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface Category {
  label: string;
  icon: LucideIcon;
  emotion: string;
}

interface CategoryTabsProps {
  categories: Category[];
  activeTab: string;
  onTabChange: (label: string) => void;
}

export default function CategoryTabs({ categories, activeTab, onTabChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide -mx-2 px-2 custom-scrollbar">
      {categories.map((cat) => (
        <button 
          key={cat.label} 
          onClick={() => onTabChange(cat.label)}
          className={cn(
            "flex items-center gap-3 px-8 py-4 rounded-[1.8rem] text-[10px] font-black uppercase tracking-[0.3em] transition-all whitespace-nowrap border relative group",
            activeTab === cat.label 
              ? "bg-white text-brand-dark border-white shadow-[0_15px_40px_rgba(255,255,255,0.1)] scale-105 z-10" 
              : "bg-white/5 border-white/5 text-slate-500 hover:border-white/20 hover:bg-white/10"
          )}
        >
          {activeTab === cat.label && (
            <motion.div 
              layoutId="tabBackground"
              className="absolute inset-0 bg-white rounded-[1.8rem] -z-10"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <cat.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", activeTab === cat.label ? "text-brand-dark" : "text-slate-600")} />
          <span className="relative z-10">{cat.label}</span>
        </button>
      ))}
    </div>
  );
}
