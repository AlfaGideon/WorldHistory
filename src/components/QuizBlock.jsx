import { useMemo, useState } from 'react';
import { CheckCircle2, GraduationCap, RotateCcw, XCircle } from 'lucide-react';

/**
 * Self-check quiz shown at the end of a curated dossier. Answers are checked
 * locally; the explanation is displayed after each attempt.
 */
export default function QuizBlock({ items = [], title = 'Проверьте себя' }) {
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});

  const questions = useMemo(() => (Array.isArray(items) ? items.filter((item) => item?.options?.length) : []), [items]);
  if (!questions.length) return null;

  const correct = questions.filter((item, index) => answers[index] === item.answer).length;
  const answered = Object.keys(answers).length;
  const finished = answered === questions.length;

  const reset = () => {
    setAnswers({});
    setRevealed({});
  };

  return (
    <section className="dossier-section quiz-block">
      <h3><GraduationCap size={20} /> {title}</h3>
      <p className="quiz-hint">
        Вопросы составлены по материалам этого досье. Ответ проверяется сразу, а пояснение показывает, на чём основан вывод.
      </p>
      <div className="quiz-list">
        {questions.map((item, index) => {
          const picked = answers[index];
          const isRevealed = revealed[index];
          const isRight = picked === item.answer;
          return (
            <article className={`quiz-card ${isRevealed ? (isRight ? 'right' : 'wrong') : ''}`} key={item.question}>
              <b>{index + 1}. {item.question}</b>
              <div className="quiz-options">
                {item.options.map((option, optionIndex) => {
                  const selected = picked === optionIndex;
                  const correctOption = optionIndex === item.answer;
                  const state = !isRevealed ? (selected ? 'selected' : '') : correctOption ? 'ok' : selected ? 'bad' : '';
                  return (
                    <button
                      key={option}
                      className={`quiz-option ${state}`}
                      disabled={isRevealed}
                      onClick={() => {
                        setAnswers((current) => ({ ...current, [index]: optionIndex }));
                        setRevealed((current) => ({ ...current, [index]: true }));
                      }}
                    >
                      <span>{option}</span>
                      {isRevealed && correctOption ? <CheckCircle2 size={16} /> : null}
                      {isRevealed && selected && !correctOption ? <XCircle size={16} /> : null}
                    </button>
                  );
                })}
              </div>
              {isRevealed && (
                <p className="quiz-explanation">
                  {isRight ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  <span>{item.explanation}</span>
                </p>
              )}
            </article>
          );
        })}
      </div>
      <div className="quiz-footer">
        <span className="quiz-score">
          {answered > 0 ? `Верно: ${correct} из ${answered}` : `Вопросов: ${questions.length}`}
          {finished ? (correct === questions.length ? ' — отличный результат!' : ' — перечитайте раздел «Что спорно».') : ''}
        </span>
        {answered > 0 && <button className="ghost small" onClick={reset}><RotateCcw size={15} /> Пройти заново</button>}
      </div>
    </section>
  );
}
