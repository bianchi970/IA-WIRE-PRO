# Fixture immagini quadri elettrici

Questa cartella deve contenere almeno 10 immagini JPEG/PNG di quadri elettrici reali
per abilitare i test di integrazione completi della ROCCO Vision Pipeline.

## Formato atteso

- Formato: JPEG (.jpg) o PNG (.png)
- Dimensioni minime: 800x600 px (consigliato 1200x1600+)
- Contenuto: quadri elettrici BT civili/industriali con componenti leggibili

## Nomi file suggeriti

- `quadro_01.jpg` — quadro civile con magnetotermici e differenziale
- `quadro_02.jpg` — quadro industriale con contattori e relè
- `quadro_03.jpg` — quadro con timer/orologio DIN
- `quadro_04.jpg` — quadro con pressostato e galleggiante
- `quadro_05.jpg` — quadro con alimentatore 24VDC
- `quadro_06.jpg` — quadro con scheda di controllo
- `quadro_07.jpg` — quadro con MCB curva C16
- `quadro_08.jpg` — quadro con RCD 30mA tipo A
- `quadro_09.jpg` — quadro con RCBO C25/30mA
- `quadro_10.jpg` — quadro con inverter VFD

## Test senza fixtures

Se le immagini non sono presenti, i test di schema/struttura vengono comunque
eseguiti con stub sintetici. I test di OCR/fusione vengono skippati con messaggio:
  "SKIP: nessuna fixture disponibile in tests/fixtures/panels/"

## Note legali

Non committare immagini con dati personali o installazioni identificabili.
