# Sound credits

Equon uses sounds from two authors. Both are credited in Configurações › Sobre.

## Cosy User Interface SFX, by Jacob (SampleKingdom)

The free edition of **Cosy User Interface SFX**, by **Jacob** at **SampleKingdom**.

- Full pack: <https://sample-kingdom.itch.io/cosy-user-interface-sfx>
- Files in this folder: `SFX_Back.wav`, `SFX_Button_1.wav`, `SFX_Button_2.wav`,
  `SFX_Dialogue_VO_Frank_004.wav`, `SFX_Item_Select.wav`, `SFX_Notification.wav`,
  `SFX_Positive_Feedback.wav`

From the author's note that comes with the free pack:

> However, if this free pack already fulfills your needs, feel free to use these sounds
> commercially!

The note allows using the sounds, commercially included. It says nothing about publishing the
raw files; they are kept here as design material for Equon, with this credit.

## Swipe, by JDSherbert

`JDSherbert_Swipe.wav`, by **JDSherbert** (<https://jdsherbert.itch.io/>), with its
`LICENSE.pdf`.

The license allows commercial and non-commercial use and **requires crediting JDSherbert**. It
also forbids redistributing the material without consent, so **neither file is in this public
repository** (`.gitignore`): they live only on the owner's machine. Installers built there carry
the sound inside the app; a build without it falls back to the move sound.

To have it in a build, place the file at `src/renderer/src/assets/sounds/licensed/section.wav`
(also ignored by git).

## Used in Equon

Copied into `src/renderer/src/assets/sounds/`, named by what they do (ARCHITECTURE.md §3.23):

| File here | In the app | When |
| --- | --- | --- |
| `SFX_Item_Select.wav` | `navigate.wav` | Moving the focus |
| `JDSherbert_Swipe.wav` | `licensed/section.wav` (not committed) | Changing section with LB/RB; `navigate.wav` when absent |
| `SFX_Button_1.wav` | `confirm.wav` | Confirming |
| `SFX_Back.wav` | `back.wav` | Going back |
| `SFX_Button_2.wav` | `play.wav` | Jogar and Instalar |
| `SFX_Notification.wav` | `modal-open.wav` | Opening a modal |
| `SFX_Dialogue_VO_Frank_004.wav` | `system-menu.wav` | Opening the system menu |

`SFX_Positive_Feedback.wav` is not used yet.
