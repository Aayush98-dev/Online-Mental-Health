import { motion, AnimatePresence } from 'motion/react';
import { Recommendation } from '../services/recommendationService';
import { Video, FileText, Bookmark, ExternalLink, CheckCircle2, Sparkles, PlayCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ResourceGridProps {
  resources: Recommendation[];
  loading: boolean;
  filterType: 'all' | 'video' | 'article';
  savedIds: string[];
  onSave: (res: Recommendation) => void;
  onPlayVideo: (video: { id: string, title: string }) => void;
}

export default function ResourceGrid({ resources, loading, filterType, savedIds, onSave, onPlayVideo }: ResourceGridProps) {
  const filtered = resources.filter(res => {
    if (filterType === 'all') return true;
    return res.type === filterType;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      <AnimatePresence mode="popLayout">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <motion.div 
              key={`skeleton-${i}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-6 space-y-4 shadow-sm h-[420px] flex flex-col border border-slate-50"
            >
              <div className="aspect-video w-full bg-slate-50 rounded-3xl animate-pulse" />
              <div className="space-y-2">
                <div className="h-6 w-3/4 bg-slate-50 rounded-lg animate-pulse" />
                <div className="h-4 w-1/2 bg-slate-50 rounded-lg animate-pulse" />
              </div>
              <div className="h-20 w-full bg-slate-50 rounded-lg animate-pulse" />
              <div className="mt-auto h-10 w-full bg-slate-50 rounded-xl animate-pulse" />
            </motion.div>
          ))
        ) : (
          filtered.map((item, idx) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: idx * 0.05 }}
              className="group glass-card p-6 flex flex-col h-full relative overflow-hidden border-white/5 bg-slate-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div 
                onClick={() => item.type === 'video' && onPlayVideo({ id: item.id, title: item.title })}
                className={cn(
                  "aspect-video w-full rounded-[2rem] overflow-hidden bg-white/5 relative mb-8 border border-white/10 shadow-2xl",
                  item.type === 'video' ? "cursor-pointer" : ""
                )}
              >
                {item.type === 'video' ? (
                  <>
                    <img 
                      src={item.thumbnail} 
                      alt={item.title} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-brand-primary/40 flex items-center justify-center group-hover:bg-brand-primary/20 transition-all">
                       <div className="w-16 h-16 bg-white/10 backdrop-blur-3xl border border-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <PlayCircle className="text-white w-8 h-8 fill-white/20" />
                       </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-brand-accent/5">
                    <div className="w-16 h-16 bg-brand-accent/20 rounded-2xl flex items-center justify-center text-brand-accent shadow-2xl">
                      <FileText className="w-8 h-8" />
                    </div>
                    <span className="text-[10px] font-black text-brand-accent uppercase tracking-[0.4em]">Intelligence Asset</span>
                  </div>
                )}
                <div className={cn(
                  "absolute top-6 left-6 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl backdrop-blur-3xl border",
                  item.type === 'video' ? "bg-red-500/20 text-red-400 border-red-500/20" : "bg-brand-teal/20 text-brand-teal border-brand-teal/20"
                )}>
                  {item.type}
                </div>
              </div>

              <div className="flex-1 px-2 space-y-4 relative z-10">
                <h3 className="text-2xl font-black text-white leading-tight tracking-tight line-clamp-2 min-h-[4rem] group-hover:text-brand-accent transition-colors">
                  {item.title}
                </h3>
                <p className="text-slate-500 text-sm font-bold leading-relaxed line-clamp-3 italic">
                  "{item.summary}"
                </p>
              </div>

              <div className="px-2 pt-10 pb-2 mt-auto flex items-center justify-between relative z-10 border-t border-white/5 pt-8">
                {item.type === 'video' ? (
                  <button 
                    onClick={() => onPlayVideo({ id: item.id, title: item.title })}
                    className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:text-brand-accent transition-all group/btn"
                  >
                    Execute Stream
                    <ExternalLink className="w-4 h-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                  </button>
                ) : (
                  <a 
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer" 
                    className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:text-brand-teal transition-all group/btn"
                  >
                    Retrieve Data
                    <ExternalLink className="w-4 h-4 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                  </a>
                )}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onSave(item);
                  }}
                  className={cn(
                    "p-4 rounded-2xl transition-all shadow-2xl border",
                    savedIds.includes(item.id) 
                      ? "bg-brand-teal/10 text-brand-teal border-brand-teal/20 scale-110" 
                      : "bg-white/5 text-slate-500 border-white/5 hover:border-white/20 hover:text-white"
                  )}
                >
                  {savedIds.includes(item.id) ? <CheckCircle2 className="w-5 h-5 shadow-inner" /> : <Bookmark className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}
