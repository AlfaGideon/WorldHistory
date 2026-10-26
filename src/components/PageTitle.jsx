export default function PageTitle({ icon: Icon, eyebrow, title, text, actions }) {
  return (
    <header className="page-title">
      <div className="page-title-main">
        {eyebrow && (
          <span className="eyebrow">
            {Icon ? <Icon size={16} /> : null} {eyebrow}
          </span>
        )}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions ? <div className="page-title-actions">{actions}</div> : null}
    </header>
  );
}
