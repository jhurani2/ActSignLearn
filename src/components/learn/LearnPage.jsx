import { useState } from 'react'
import HandModelViewer from './HandModelViewer'
import LetterInfo from './LetterInfo'
import LetterSelector from './LetterSelector'
import signMeta from '../../data/signMeta'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export default function LearnPage() {
  const [selected, setSelected] = useState('A')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, height: '100%' }}>
      <div>
        <h1>Learn ASL Letters</h1>
        <LetterSelector
          letters={LETTERS}
          selectedLetter={selected}
          onSelect={setSelected}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, minHeight: 500 }}>
        <div style={{ height: '100%' }}>
          <HandModelViewer letter={selected} />
        </div>
        <LetterInfo letter={selected} info={signMeta[selected]} />
      </div>
    </div>
  )
}