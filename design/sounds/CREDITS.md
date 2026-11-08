# Sound credits

The `.wav` files in this folder come from the free edition of **Cosy User Interface SFX**, by
**Jacob** at **SampleKingdom**.

- Full pack: <https://sample-kingdom.itch.io/cosy-user-interface-sfx>
- Files: `SFX_Back.wav`, `SFX_Button_1.wav`, `SFX_Button_2.wav`, `SFX_Dialogue_VO_Frank_004.wav`,
  `SFX_Item_Select.wav`, `SFX_Notification.wav`, `SFX_Positive_Feedback.wav`

## Used in Equon

Copied into `src/renderer/src/assets/sounds/`, named by what they do (ARCHITECTURE.md §3.23):

| File here | In the app | When |
| --- | --- | --- |
| `SFX_Item_Select.wav` | `navigate.wav` | Moving the focus |
| `SFX_Button_1.wav` | `confirm.wav` | Confirming |
| `SFX_Back.wav` | `back.wav` | Going back |
| `SFX_Button_2.wav` | `play.wav` | Jogar and Instalar |
| `SFX_Notification.wav` | `modal-open.wav` | Opening a modal |
| `SFX_Dialogue_VO_Frank_004.wav` | `system-menu.wav` | Opening the system menu |

`SFX_Positive_Feedback.wav` is not used yet.

## License

From the author's note that comes with the free pack:

> However, if this free pack already fulfills your needs, feel free to use these sounds
> commercially!

The note allows using the sounds, commercially included. It says nothing about publishing the
raw files; they are kept here as design material for Equon, with this credit. Equon also
credits the pack in Configurações › Sobre.
