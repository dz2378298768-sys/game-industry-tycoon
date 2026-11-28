import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const output = path.resolve('artifacts/pc-build')
const game = path.join(output, 'win-unpacked')
const zip = path.join(output, 'GameIndustryTycoon-Windows-x64-TapTap-compatible.zip')
if (!existsSync(path.join(game, 'GameIndustryTycoon.exe'))) {
  throw new Error('Windows executable missing from the build output')
}
const command = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.IO.Compression.FileSystem',
  '$temporary = $env:TYCOON_ZIP_DESTINATION + "." + [guid]::NewGuid() + ".tmp"',
  'try {',
  '  [IO.Compression.ZipFile]::CreateFromDirectory($env:TYCOON_ZIP_SOURCE, $temporary, [IO.Compression.CompressionLevel]::Optimal, $false)',
  '  Move-Item -LiteralPath $temporary -Destination $env:TYCOON_ZIP_DESTINATION -Force',
  '} finally {',
  '  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }',
  '}',
  'exit 0',
].join('\n')
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
  stdio: 'inherit',
  env: { ...process.env, TYCOON_ZIP_SOURCE: game, TYCOON_ZIP_DESTINATION: zip },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
if (result.status === 0) globalThis.console.log(zip)
