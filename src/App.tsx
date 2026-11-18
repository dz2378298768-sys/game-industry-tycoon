import React from 'react'
import { useGameStore } from '@ui/state/game-store'
import { CreateCompany } from '@app/create-company'
import { GameShell } from '@app/game-shell'

const App: React.FC = () => {
  const { game } = useGameStore()
  if (!game) return <CreateCompany />
  return <GameShell />
}

export default App
