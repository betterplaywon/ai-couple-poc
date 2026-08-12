import { useState } from 'react'

type Props = {
  disabled: boolean
  onSend: (text: string) => void
}

export function Composer({ disabled, onSend }: Props) {
  const [text, setText] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    setText('')
    onSend(trimmed)
  }

  return (
    <form className="composer" onSubmit={submit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={disabled ? '답장을 기다리는 중…' : '무슨 말을 할까'}
        disabled={disabled}
        autoFocus
        maxLength={300}
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        보내기
      </button>
    </form>
  )
}
