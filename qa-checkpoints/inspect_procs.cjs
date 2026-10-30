const { execSync } = require('child_process');
try {
  const script = `Get-Process node | ForEach-Object { [PSCustomObject]@{ Id = $_.Id; CommandLine = (Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.Id)).CommandLine } } | Format-List`;
  const out = execSync(`powershell -NoProfile -Command "${script}"`, { encoding: 'utf8' });
  console.log(out);
} catch (err) {
  console.error(err.message);
}
