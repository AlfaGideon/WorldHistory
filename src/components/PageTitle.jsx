export default function PageTitle({ icon: Icon, eyebrow, title, text }) {
  return (
    <div className="page-title">
      <span className="eyebrow"><Icon size={16} /> {eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
