$ErrorActionPreference = 'Stop'
$projectRef = 'dhxckgfuapniettrohvo'

$required = @(
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'STRAVA_REDIRECT_URI',
  'STRAVA_STATE_SECRET',
  'STRAVA_FRONTEND_REDIRECT_URI'
)

foreach ($name in $required) {
  if ([string]::IsNullOrWhiteSpace((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value)) {
    throw "Missing $name. Set it in this PowerShell session before running this script."
  }
}

$temporaryEnvFile = Join-Path $env:TEMP "gymlog-strava-secrets-$([guid]::NewGuid().ToString('N')).env"
try {
  @(
    "STRAVA_CLIENT_ID=$env:STRAVA_CLIENT_ID"
    "STRAVA_CLIENT_SECRET=$env:STRAVA_CLIENT_SECRET"
    "STRAVA_REDIRECT_URI=$env:STRAVA_REDIRECT_URI"
    "STRAVA_STATE_SECRET=$env:STRAVA_STATE_SECRET"
    "STRAVA_FRONTEND_REDIRECT_URI=$env:STRAVA_FRONTEND_REDIRECT_URI"
  ) | Set-Content -LiteralPath $temporaryEnvFile -Encoding utf8

  npx supabase secrets set --project-ref $projectRef --env-file $temporaryEnvFile
}
finally {
  Remove-Item -LiteralPath $temporaryEnvFile -Force -ErrorAction SilentlyContinue
}
