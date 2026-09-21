/**
 * The cooperative's marks.
 *
 * There are two, and conflating them is a real mistake rather than a
 * pedantic distinction:
 *
 *   - the WORDMARK is 2144x733, the letters FYRO set as a logotype. It
 *     belongs wherever the brand is stated once, at the top of a screen,
 *     and it must never be squeezed into a square: rendered at 26x26 it is
 *     an illegible black smear, and rendered NEXT TO the word "FYRO" it is
 *     the same word twice.
 *   - the ICON is square, and belongs in the places that demand a square:
 *     the favicon, the PWA install tile, the app switcher, an avatar slot.
 *
 * The supplied wordmark has a solid light background rather than an alpha
 * channel, so it is rendered with `mix-blend-mode: multiply` on the app's
 * light surfaces — black letters stay black, the near-white ground
 * multiplies away against bone. That is a workaround for the asset, not a
 * design choice; a transparent PNG or an SVG would drop it.
 */

/** The logotype. Wide. Use <Wordmark/>, which enforces the aspect ratio. */
export const FYRO_WORDMARK_URL =
  'https://res.cloudinary.com/dqwm8wgg8/image/upload/v1789957130/lj62whfn0j1ft1jefmm5.png';

/** Natural size of the wordmark, so callers can size by height and let width follow. */
export const FYRO_WORDMARK_RATIO = 2144 / 733;

/**
 * The square mark, for favicons, the PWA tile and avatar-shaped slots.
 *
 * Still the earlier asset: the new wordmark is 2.9:1 and there is no honest
 * way to make a square out of it that is not either cropped to "FY" or
 * letterboxed into mostly-empty space.
 */
export const FYRO_ICON_URL =
  'https://res.cloudinary.com/dqwm8wgg8/image/upload/v1789117365/6ccefbc0-b98d-4021-8dcd-6013cc96376a.png';

/**
 * Kept so nothing that only needs "a FYRO image" breaks, and pointed at the
 * square one — every existing caller was rendering it in a square box.
 */
export const FYRO_LOGO_URL = FYRO_ICON_URL;
