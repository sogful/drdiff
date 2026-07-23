::raw
<div class="clhead">Deltarune Chapter 1&amp;2 LTS Version&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Patch!</div>

<div class="clrow">
  <img class="cldood" src="/assets/images/doodles/LTS-3-hatless.png" alt="">
  <div class="clbody">
    <div class="clsub">How to get it---</div>
    <p>
      --&gt; Steam should update with it automatically.<br>
      --&gt; If you downloaded it on itch.io, redownload the game.
    </p>
    <p class="clred">
      It will say "DELTARUNE v3" in the bottom left of the Chapter Select<br>
      if you have it.
    </p>
    <div class="clsub">Who&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;?---</div>
    <p>--&gt;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;you</p>
  </div>
</div>

<div class="clhead thin">DELTARUNE LTS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Patch Notes</div>

<div class="clrow tight">
  <img class="cldoodsm" src="/assets/images/doodles/LTS-3-overall.png" alt="">
  <div class="clhead thin">OVERALL</div>
  <img class="cldoodsm" src="/assets/images/doodles/LTS-3-overall.png" alt="">
</div>

<p>
  GameMaker LTS (the engine) was updated again, with a fix that's potentially supposed to fix an
  issue using full-screen when swapping Chapters with game_change().
</p>
<p>
  ... However, it doesn't seem to fix the problem when using the "borderless full-screen" setting
  that we use, so this basically has no effect.
</p>
<p>
  The mechanism which records which Shadow Crystals you have attained has been completely
  rewritten, and should now keep that information stored more permanently.
</p>
<p>The game now displays the correct buttons when using a PS5 controller.</p>

<div class="clrow top">
  <div class="clhead clbody clshift"><span class="clsy125">CHAPTER SELECT SCREEN</span></div>
  <img class="cldood" src="/assets/images/doodles/LTS-3-stars.png" alt="">
</div>

<p>The Chapter Select menu is reprogrammed from scratch.</p>
<p>
  The Chapter Select menu now shows more information about the completion status of each Chapter,
  ex. showing yellow stars which indicate Chapters have completion data.
</p>
<p class="clsmallnote">(Note: There are no plans to require the player to complete  multiple different file slots.)</p>
<p>You can now toggle the language at the bottom of the screen.</p>
<p>
  If you intentionally return to the Chapter Select screen from within Chapter 1 or 2, it will skip
  the intro screen where it asks if you want to continue from a given chapter.
</p>

<div class="clrow tight">
  <img class="cldoodmd" src="/assets/images/doodles/LTS-3-susieleft.png" alt="">
  <div class="clhead">Chapter 1</div>
  <img class="cldoodmd" src="/assets/images/doodles/LTS-3-susieright.png" alt="">
</div>

<ul>
  <li>The Lancer and Susie battle no longer has the SOUL escape from the box when she gets up from being attacked.</li>
  <li>Fixed crash if you use the ReviveMint on Susie after defeating King.</li>
  <li>Fixed Jevil not having the correct text sound when receiving ShadowCrystal</li>
  <li>Fixed a missing line of pixels on final image of the sepia intro</li>
  <li>Adjusted bottom collision for King's battle arena</li>
</ul>
<img class="cldoodsm clfloatright" src="/assets/images/doodles/LTS-3-starwalker.png" alt="">
<ul>
  <li>Fixed Susie flickering at the end of Susie and Lancer battle</li>
  <li>The HP bars of the characters properly go away in the Starwalker room</li>
</ul>

<div class="clrow tight">
  <img class="cldoodmd" src="/assets/images/doodles/LTS-3-susieleft2.png" alt="">
  <div class="clhead">Chapter 2</div>
  <img class="cldoodmd" src="/assets/images/doodles/LTS-3-susieright2.png" alt="">
</div>

<ul>
  <li>Fixed an exploit in cyber_maze_tasque where you could fight Tasque violently infinite times.</li>
  <li>Regenerated Japanese fonts to support missing kanji.</li>
  <li>Fixed a a problem where, when dodging bullets before fighting Sweet, Cap'n, and K_K, if the system's audio settings were changed, the game could get stuck.</li>
  <li>The Egg is no longer unintentionally lost at the convenience store.</li>
  <li>Changed the "Sleep Margin" to "30".</li>
  <li>Various sound effects now play at the correct pitch.</li>
</ul>

<div class="clcorner"><img class="cldood" src="/assets/images/doodles/LTS-3-noelle.png" alt=""></div>
