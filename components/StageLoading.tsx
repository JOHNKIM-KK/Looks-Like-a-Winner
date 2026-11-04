type Props = {
  progress: number;
};

export function StageLoading({ progress }: Props) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div
      role="status"
      aria-label="경기장 준비 중"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#C9A25E] text-[#3b2410]"
    >
      <p className="text-lg font-black tracking-[0.2em]">경기장 준비 중</p>
      <div className="h-2 w-56 overflow-hidden rounded-full bg-[#3b2410]/20">
        <div className="h-full rounded-full bg-[#d4602a] transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
