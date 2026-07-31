interface PatternLockInputProps {
  value: number[];
  onChange: (value: number[]) => void;
}

const pontos = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function PatternLockInput({ value, onChange }: PatternLockInputProps) {
  const toggle = (ponto: number) => {
    if (value.includes(ponto)) {
      onChange(value.filter((item) => item !== ponto));
      return;
    }
    onChange([...value, ponto]);
  };

  return (
    <div className="pattern-lock-wrapper">
      <div className="pattern-lock-grid" role="group" aria-label="Padrão de desbloqueio">
        {pontos.map((ponto) => {
          const indice = value.indexOf(ponto);
          return (
            <button
              type="button"
              key={ponto}
              className={`pattern-dot ${indice >= 0 ? 'selected' : ''}`}
              onClick={() => toggle(ponto)}
            >
              <span>{indice >= 0 ? indice + 1 : ''}</span>
            </button>
          );
        })}
      </div>
      <div className="pattern-lock-actions">
        <small>Clique nos pontos na ordem do desenho. O número mostra a sequência.</small>
        <button type="button" className="button button-small" onClick={() => onChange([])}>
          Limpar padrão
        </button>
      </div>
    </div>
  );
}
