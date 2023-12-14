# TODO
- macro button design + package
- UI button

- 
# Actor Sheet Locker for Foundry VTT
<table style="border:0">
  <tr>
    <td><img src="src/actor-sheet-locker/artwork/actor-sheet-locker-logo.png" width="600" alt="Actor Sheet Locker Logo"/></td>
    <td><span style="color:#da6502"></span><br/>
        <br/>
        <i><strong>"Here goes ...<br/>
            ... some fancy ...<br/>
            ... slogan"</strong></i>
    </td>
  </tr>
</table>

## Video demo on youtube
[actor-sheet-locker Demo](https://youtu.be/actor-sheet-locker)

[<img src="src/actor-sheet-locker/artwork/actor-sheet-locker-video-thumb.png" alt="actor-sheet-locker - Video demo on youtube" width="600"/>](https://youtu.be/actor-sheet-locker)

- [What does it do ...](#what-does-it-do-)
- [Changelog](#changelog)
- [Upcoming features](#upcoming-features)
- [Tech stuff](#tech-stuff)
  * [Adjustable module settings (i.e. game settings)](#adjustable-module-settings--ie-game-settings-)
  * [Control it by macro!](#control-it-by-macro-)
  * [Compatibility and Dependencies](#compatibility-and-dependencies)

  <small><i><a href='http://ecotrust-canada.github.io/markdown-toc/'>Table of contents generated with markdown-toc</a></i></small>

## What does it do ...


## Changelog
See [CHANGELOG.md](CHANGELOG.md)

## Upcoming features
Feel free to follow the ["dev" branch on GitHub](https://github.com/coffiarts/FoundryVTT-actor-sheet-locker/tree/dev) to stay tuned: [https://github.com/coffiarts/FoundryVTT-actor-sheet-locker/tree/dev](https://github.com/coffiarts/FoundryVTT-actor-sheet-locker/tree/dev)

Some things I am *considering* to do (feedback welcome!):

- `small`: some small feature
- `big`: some big feature

## Tech stuff
### Adjustable module settings (i.e. game settings)
This screenshot shows the default values.

<img src="src/actor-sheet-locker/artwork/actor-sheet-locker-settings.png" alt="actor-sheet-locker settings"/>

### Control it by macro!
Use the exposed `class MyModuleMacroAPI` - just like this, it's a no-brainer:

<img src="src/actor-sheet-locker/artwork/actor-sheet-locker-toggle-macro.png" alt="actor-sheet-locker macro example"/>

Some more variants:

    // Toggle specifically on and off (pretty obvious)
    MyModuleMacroAPI.someFunction();

### Compatibility and Dependencies
- some dependencies
