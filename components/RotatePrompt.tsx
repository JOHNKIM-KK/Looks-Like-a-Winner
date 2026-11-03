export function RotatePrompt() {
  return (
    <div
      data-testid="rotate-prompt"
      role="status"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#1b1030] px-8 text-center text-[#fff6ea]"
    >
      <div aria-hidden="true" className="h-16 w-10 rotate-90 rounded-md border-4 border-[#5ce1ff]" />
      <p className="text-lg font-bold">화면을 가로로 돌려 주세요</p>
    </div>
  );
}
