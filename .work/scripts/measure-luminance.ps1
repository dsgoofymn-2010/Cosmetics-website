param([Parameter(Mandatory=$true)][string]$Path)
Add-Type -AssemblyName System.Drawing
function Lum($c) { [int][math]::Round(0.2126*$c.R + 0.7152*$c.G + 0.0722*$c.B) }
function Stats($values) {
  $smooth = @()
  for ($i=10; $i -lt $values.Count-10; $i++) {
    $smooth += [math]::Round((($values[($i-10)..($i+10)] | Measure-Object -Average).Average), 2)
  }
  $peaks = @()
  $rises = 0
  for ($i=1; $i -lt $smooth.Count-1; $i++) {
    $peaks += $smooth[$i] - [math]::Max($smooth[$i-1], $smooth[$i+1])
    if ($smooth[$i] -gt $smooth[$i-1] -and $smooth[$i+1] -lt $smooth[$i]) { $rises++ }
  }
  [pscustomobject]@{
    min=[math]::Round(($values | Measure-Object -Minimum).Minimum,2)
    max=[math]::Round(($values | Measure-Object -Maximum).Maximum,2)
    avg=[math]::Round(($values | Measure-Object -Average).Average,2)
    localPeak=[math]::Round(($peaks | Measure-Object -Maximum).Maximum,2)
    directionChanges=$rises
    start=[math]::Round(($smooth | Select-Object -First 1),2)
    end=[math]::Round(($smooth | Select-Object -Last 1),2)
  }
}
$bmp=[Drawing.Bitmap]::new($Path)
$w=$bmp.Width; $h=$bmp.Height
$horizontal=@(); for($x=720;$x -lt $w;$x++){ $horizontal += Lum $bmp.GetPixel($x,[int]($h*.45)) }
$vertical=@(); for($y=100;$y -le 800;$y++){ $vertical += Lum $bmp.GetPixel([int]($w*.85),$y) }
[pscustomobject]@{path=$Path;horizontal=(Stats $horizontal);vertical=(Stats $vertical)} | ConvertTo-Json -Depth 4
$bmp.Dispose()
