export function RotatePrompt() {
  return (
    <div className="rotate-prompt" data-testid="rotate-prompt" role="status">
      <div className="rotate-prompt-phone" aria-hidden="true">
        <div className="rotate-prompt-home" />
      </div>
      <p className="rotate-prompt-label">가로로 돌려 주세요</p>
    </div>
  );
}
