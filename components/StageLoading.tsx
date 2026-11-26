type Props = {
  progress: number;
};

export function StageLoading({ progress }: Props) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <div className="night-root is-loading" role="status" aria-label="경기장 준비 중">
      <div className="night loading">
        <img className="logo" src="/logo_winning_post@2x.png" alt="WINNING POST" width={220} height={42} />
        <div className="bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
