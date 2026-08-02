import './NumericKeypad.css'

interface Props {
  onKey: (key: string) => void
  showDecimal?: boolean
}

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
] as const

export default function NumericKeypad({ onKey, showDecimal = true }: Props) {
  return (
    <div className="keypad">
      {ROWS.map((row) =>
        row.map((k) => (
          <button key={k} className="keypad-key" onClick={() => onKey(k)}>
            {k}
          </button>
        )),
      )}
      <button className="keypad-key" onClick={() => onKey(showDecimal ? '.' : '')}>
        {showDecimal ? '.' : ''}
      </button>
      <button className="keypad-key" onClick={() => onKey('0')}>
        0
      </button>
      <button className="keypad-key keypad-del" onClick={() => onKey('⌫')}>
        ⌫
      </button>
    </div>
  )
}
