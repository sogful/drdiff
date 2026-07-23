# DELTARUNE Chapter 1&2 LTS - December Patch

### OVERALL
- GameMaker LTS (the engine) was updated again, with a fix that's potentially supposed to fix an issue using full-screen when swapping Chapters with game_change().
- However, it doesn't seem to fix the problem when using the “borderless full-screen” setting that we use, so this basically has no effect.
- The mechanism which records which Shadow Crystals you have attained has been completely rewritten, and should now keep that information stored more permanently.
- The game now displays the correct buttons when using a PS5 controller.

### CHAPTER SELECT SCREEN
- The Chapter Select menu is reprogrammed from scratch.
- The Chapter Select menu now shows more information about the completion status of each Chapter, ex. showing yellow stars which indicate Chapters have completion data.
- (Note: There are no plans to require the player to complete multiple different file slots.)
- You can now toggle the language at the bottom of the screen.
- If you intentionally return to the Chapter Select screen from within Chapter 1 or 2, it will skip the intro screen where it asks if you want to continue from a given chapter.

### Chapter 1
- The Lancer and Susie battle no longer has the SOUL escape from the box when she gets up from being attacked.
- Fixed crash if you use the ReviveMint on Susie after defeating King.
- Fixed Jevil not having the correct text sound when receiving ShadowCrystal
- Fixed a missing line of pixels on final image of the sepia intro
- Adjusted bottom collision for King's battle arena
- Fixed Susie flickering at the end of Susie and Lancer battle
- The HP bars of the characters properly go away in the Starwalker room

### Chapter 2
- Fixed an exploit in cyber_maze_tasque where you could fight Tasque violently infinite times.
- Regenerated Japanese fonts to support missing kanji.
- Fixed a problem where, when dodging bullets before fighting Sweet, Cap'n, and K_K, if the system's audio settings were changed, the game could get stuck.
- The Egg is no longer unintentionally lost at the convenience store.
- Changed the "Sleep Margin" to "30".
- Various sound effects now play at the correct pitch.
