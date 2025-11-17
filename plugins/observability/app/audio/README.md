# Audio Files

This directory contains audio files for the observability UI.

## Files

### test-notification.ogg
Placeholder notification sound for testing the speak_to_human widget.
This file should be replaced with an actual audio file generated using a tool like jsfxr or a simple tone generator.

To generate a simple test tone using ffmpeg:
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=0.5" -c:a libvorbis test-notification.ogg
```

Or use an online tool like jsfxr (https://sfxr.me/) to create a notification sound effect.

## Usage

The speak_to_human widget will attempt to play audio files from this directory when the `output_file` parameter is provided in the tool call.

Example:
```yaml
- type: TOOL_CALL
  tool: speak_to_human
  params:
    text: "Task completed"
    preset: bella
    output_file: /audio/test-notification.ogg
```
