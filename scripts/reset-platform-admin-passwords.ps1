$ErrorActionPreference = 'Stop'

function Read-ConfirmedPassword([string]$Email) {
  while ($true) {
    $first = Read-Host "Nueva contraseña para $Email" -AsSecureString
    $second = Read-Host 'Repítela para confirmar' -AsSecureString
    $plainFirst = [System.Net.NetworkCredential]::new('', $first).Password
    $plainSecond = [System.Net.NetworkCredential]::new('', $second).Password

    if ($plainFirst.Length -lt 12) {
      Write-Host 'Debe tener al menos 12 caracteres.' -ForegroundColor Yellow
      continue
    }
    if ($plainFirst -cne $plainSecond) {
      Write-Host 'No coinciden. Intenta de nuevo.' -ForegroundColor Yellow
      continue
    }

    return $plainFirst
  }
}

function New-OmdexaHash([string]$Password) {
  $salt = [guid]::NewGuid().ToString()
  $kdf = [System.Security.Cryptography.Rfc2898DeriveBytes]::new(
    $Password,
    [System.Text.Encoding]::UTF8.GetBytes($salt),
    100000,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256
  )
  try {
    $bytes = $kdf.GetBytes(32)
  } finally {
    $kdf.Dispose()
  }
  $encoded = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
  return "pbkdf2:100000:${salt}:${encoded}"
}

$emails = @('admin@omdexa.com', 'otomonsivais@gmail.com')
$passwords = @{}
foreach ($email in $emails) {
  $passwords[$email] = Read-ConfirmedPassword $email
}

$hashes = @{}
foreach ($email in $emails) {
  $hashes[$email] = New-OmdexaHash $passwords[$email]
}
$passwords.Clear()

$now = [DateTime]::UtcNow.ToString('o')
$sqlPath = Join-Path $env:TEMP ("omdexa-password-reset-$([guid]::NewGuid()).sql")

try {
  $sql = @"
UPDATE users SET password_hash = '$($hashes['admin@omdexa.com'])', updated_at_utc = '$now' WHERE lower(email) = 'admin@omdexa.com' AND role = 'platform_admin';
DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email) = 'admin@omdexa.com' AND role = 'platform_admin');
UPDATE users SET password_hash = '$($hashes['otomonsivais@gmail.com'])', updated_at_utc = '$now' WHERE lower(email) = 'otomonsivais@gmail.com' AND role = 'platform_admin';
DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE lower(email) = 'otomonsivais@gmail.com' AND role = 'platform_admin');
"@
  [System.IO.File]::WriteAllText($sqlPath, $sql, [System.Text.UTF8Encoding]::new($false))
  & npx.cmd wrangler d1 execute saas --remote --file $sqlPath
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler terminó con código $LASTEXITCODE"
  }
  Write-Host ''
  Write-Host 'Contraseñas actualizadas. Las sesiones anteriores quedaron cerradas.' -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $sqlPath) {
    Remove-Item -LiteralPath $sqlPath -Force
  }
  $hashes.Clear()
}
