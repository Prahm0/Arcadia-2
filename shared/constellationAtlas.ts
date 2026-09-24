import { CONSTELLATION_ART } from "./constellationArt.ts";

/** Every star on the 88 cards is one classic 25-minute focus. */
export const MINUTES_PER_STAR = 25;
const SKY_SQUARE_DEGREES = 41253;

export type Hemisphere = "Northern" | "Southern" | "Equator";
export interface AtlasFacts {
  abbr: string;
  brightest: string;
  /** "Ancient" for Ptolemy's 48, otherwise the year it was first charted. */
  charted: string;
  areaPercent: number;
  hemisphere: Hemisphere;
  bestMonth: string;
}
export interface AtlasEntry extends AtlasFacts {
  id: string;
  name: string;
  family: string;
  meaning: string;
  description: string;
}

// [abbr, name, family, meaning, brightest star, first charted, area in square degrees, best evening month, description]
type Row = [string, string, string, string, string, string, number, string, string];
const ROWS: Row[] = [
  ["And", "Andromeda", "Perseus family", "The chained princess", "Alpheratz", "Ancient", 722, "November", "Chained to a sea rock as an offering to Cetus, then rescued by Perseus. The Andromeda Galaxy sits just above her knee."],
  ["Ant", "Antlia", "La Caille family", "The air pump", "Alpha Antliae", "1756", 239, "April", "Lacaille named it after the vacuum pump, one of the new instruments of the scientific age."],
  ["Aps", "Apus", "Bayer family", "The bird of paradise", "Alpha Apodis", "1598", 206, "July", "Named for the birds Dutch sailors saw in New Guinea. Apus means \"without feet\", after the legless skins traded to Europe."],
  ["Aqr", "Aquarius", "Zodiac", "The water-bearer", "Sadalsuud", "Ancient", 980, "October", "Ganymede, cupbearer to the gods, pouring water across a patch of sky the ancients called the Sea."],
  ["Aql", "Aquila", "Hercules family", "The eagle", "Altair", "Ancient", 652, "August", "Zeus's eagle, carrier of his thunderbolts. Altair spins so fast it bulges at its equator."],
  ["Ara", "Ara", "Hercules family", "The altar", "Beta Arae", "Ancient", 237, "July", "The altar where the gods swore allegiance before battling the Titans. The Milky Way is its rising smoke."],
  ["Ari", "Aries", "Zodiac", "The ram", "Hamal", "Ancient", 441, "December", "The ram with the golden fleece that Jason and the Argonauts sailed off to find."],
  ["Aur", "Auriga", "Perseus family", "The charioteer", "Capella", "Ancient", 657, "February", "A charioteer cradling a goat. Capella, \"the little she-goat\", is the sixth-brightest star at night."],
  ["Boo", "Boötes", "Ursa Major family", "The herdsman", "Arcturus", "Ancient", 907, "June", "The herdsman driving the bears around the pole. Arcturus is the brightest star north of the celestial equator."],
  ["Cae", "Caelum", "La Caille family", "The chisel", "Alpha Caeli", "1756", 125, "January", "An engraver's chisel, one of Lacaille's tools of the trade. Faint, small and patient."],
  ["Cam", "Camelopardalis", "Ursa Major family", "The giraffe", "Beta Camelopardalis", "1612", 757, "February", "A giraffe stretching its long neck toward the pole. Big and faint, it rewards a dark sky."],
  ["Cnc", "Cancer", "Zodiac", "The crab", "Tarf", "Ancient", 506, "March", "The crab Hera sent to nip Hercules mid-fight. At its heart is the Beehive, a cluster you can see without a telescope."],
  ["CVn", "Canes Venatici", "Ursa Major family", "The hunting dogs", "Cor Caroli", "1687", 465, "May", "The two dogs Boötes holds on a leash. Cor Caroli means \"Charles's heart\", after an English king."],
  ["CMa", "Canis Major", "Orion family", "The great dog", "Sirius", "Ancient", 380, "February", "Orion's larger hunting dog, carrying Sirius, the brightest star in the night sky."],
  ["CMi", "Canis Minor", "Orion family", "The little dog", "Procyon", "Ancient", 183, "March", "Orion's smaller dog. Procyon means \"before the dog\": it rises just ahead of Sirius."],
  ["Cap", "Capricornus", "Zodiac", "The sea-goat", "Deneb Algedi", "Ancient", 414, "September", "Half goat, half fish: Pan leapt into a river to escape the monster Typhon and changed shape midway."],
  ["Car", "Carina", "Heavenly Waters", "The keel", "Canopus", "1756", 494, "March", "The keel of the Argo, Jason's ship. Canopus, the second-brightest star at night, rides along it."],
  ["Cas", "Cassiopeia", "Perseus family", "The queen", "Gamma Cassiopeiae", "Ancient", 598, "November", "Queen Cassiopeia, who boasted of her beauty to the sea nymphs. Her W is easy to find."],
  ["Cen", "Centaurus", "Hercules family", "The centaur", "Rigil Kentaurus", "Ancient", 1060, "May", "Chiron, the wise centaur who taught heroes. Alpha Centauri, the nearest star system to the Sun, is at his hoof."],
  ["Cep", "Cepheus", "Perseus family", "The king", "Alderamin", "Ancient", 588, "October", "King Cepheus, Andromeda's father. His star Delta Cephei taught astronomers how to measure the universe."],
  ["Cet", "Cetus", "Perseus family", "The sea monster", "Diphda", "Ancient", 1231, "November", "The monster sent to devour Andromeda. Its star Mira brightens and fades over about eleven months."],
  ["Cha", "Chamaeleon", "Bayer family", "The chameleon", "Alpha Chamaeleontis", "1598", 132, "April", "A small chameleon near the south celestial pole, tongue out for the Fly next door."],
  ["Cir", "Circinus", "La Caille family", "The compasses", "Alpha Circini", "1756", 93, "June", "A pair of drafting compasses, drawn by Lacaille beside the Set Square."],
  ["Col", "Columba", "Heavenly Waters", "The dove", "Phact", "1592", 270, "January", "The dove Noah sent from the ark, flying just behind the Great Dog."],
  ["Com", "Coma Berenices", "Ursa Major family", "Berenice's hair", "Beta Comae Berenices", "1536", 386, "May", "Queen Berenice cut off her hair as an offering for her husband's safe return, and it was set in the sky."],
  ["CrA", "Corona Australis", "Hercules family", "The southern crown", "Meridiana", "Ancient", 128, "August", "A wreath of stars at the Archer's feet, an arc you can trace in one glance."],
  ["CrB", "Corona Borealis", "Ursa Major family", "The northern crown", "Alphecca", "Ancient", 179, "July", "The crown Dionysus gave Ariadne. A near-perfect semicircle of stars."],
  ["Crv", "Corvus", "Hercules family", "The crow", "Gienah", "Ancient", 184, "May", "Apollo's crow, set in the sky for lying, forever unable to drink from the Cup beside it."],
  ["Crt", "Crater", "Hercules family", "The cup", "Labrum", "Ancient", 282, "April", "Apollo's cup, just out of the Crow's reach."],
  ["Cru", "Crux", "Hercules family", "The Southern Cross", "Acrux", "1589", 68, "May", "The smallest constellation, and one of the most loved. It's on the Australian flag."],
  ["Cyg", "Cygnus", "Hercules family", "The swan", "Deneb", "Ancient", 804, "September", "Zeus disguised as a swan, flying down the Milky Way. Its long body is also called the Northern Cross."],
  ["Del", "Delphinus", "Heavenly Waters", "The dolphin", "Rotanev", "Ancient", 189, "September", "The dolphin that found Amphitrite for Poseidon. Read two of its star names backwards and you get an astronomer's name."],
  ["Dor", "Dorado", "Bayer family", "The swordfish", "Alpha Doradus", "1598", 179, "January", "A dolphinfish holding most of the Large Magellanic Cloud, a whole neighbouring galaxy."],
  ["Dra", "Draco", "Ursa Major family", "The dragon", "Eltanin", "Ancient", 1083, "July", "The dragon that guarded the golden apples. Thuban, in its tail, was the pole star when the pyramids were built."],
  ["Equ", "Equuleus", "Heavenly Waters", "The little horse", "Kitalpha", "Ancient", 72, "September", "A little horse's head peeking out beside Pegasus. The second-smallest constellation."],
  ["Eri", "Eridanus", "Heavenly Waters", "The river", "Achernar", "Ancient", 1138, "December", "A river winding from Orion's foot to Achernar, \"the end of the river\", deep in the south."],
  ["For", "Fornax", "La Caille family", "The furnace", "Dalim", "1756", 398, "December", "A chemist's furnace. The Hubble Ultra Deep Field, thousands of galaxies in one frame, is here."],
  ["Gem", "Gemini", "Zodiac", "The twins", "Pollux", "Ancient", 514, "February", "Castor and Pollux, the twins who chose to share immortality rather than be parted."],
  ["Gru", "Grus", "Bayer family", "The crane", "Alnair", "1598", 366, "October", "A crane in flight with its neck stretched out, charted on early voyages south."],
  ["Her", "Hercules", "Hercules family", "The hero", "Kornephoros", "Ancient", 1225, "July", "Hercules, kneeling, after his twelve labours. Home to M13, one of the finest star clusters in the north."],
  ["Hor", "Horologium", "La Caille family", "The pendulum clock", "Alpha Horologii", "1756", 249, "December", "A pendulum clock, honouring Huygens' invention. Long, faint and quiet, like a study hall."],
  ["Hya", "Hydra", "Hercules family", "The water snake", "Alphard", "Ancient", 1303, "April", "The largest constellation: the many-headed serpent Hercules fought, stretching over a quarter of the way around the sky."],
  ["Hyi", "Hydrus", "Bayer family", "The little water snake", "Beta Hydri", "1598", 243, "December", "A small water snake coiled between the two Magellanic Clouds."],
  ["Ind", "Indus", "Bayer family", "The Indian", "Alpha Indi", "1598", 294, "September", "A figure holding arrows, as Dutch navigators pictured the people they met on their voyages."],
  ["Lac", "Lacerta", "Perseus family", "The lizard", "Alpha Lacertae", "1687", 201, "October", "A lizard Hevelius slipped in between Cygnus and Andromeda to fill the gap."],
  ["Leo", "Leo", "Zodiac", "The lion", "Regulus", "Ancient", 947, "April", "The Nemean lion, Hercules' first labour. Its head is a backwards question mark called the Sickle."],
  ["LMi", "Leo Minor", "Ursa Major family", "The little lion", "Praecipua", "1687", 232, "April", "A lion cub under Leo's paws, added by Hevelius."],
  ["Lep", "Lepus", "Orion family", "The hare", "Arneb", "Ancient", 290, "January", "A hare crouched at Orion's feet, keeping low from the hunter and his dogs."],
  ["Lib", "Libra", "Zodiac", "The scales", "Zubeneschamali", "Ancient", 538, "June", "The scales of justice, the only zodiac sign that isn't a creature. Its stars were once the Scorpion's claws."],
  ["Lup", "Lupus", "Hercules family", "The wolf", "Alpha Lupi", "Ancient", 334, "June", "A wild animal speared by the Centaur, later pictured as a wolf."],
  ["Lyn", "Lynx", "Ursa Major family", "The lynx", "Alpha Lyncis", "1687", 545, "March", "Hevelius said you'd need the eyes of a lynx to see it. He wasn't wrong."],
  ["Lyr", "Lyra", "Hercules family", "The lyre", "Vega", "Ancient", 286, "August", "Orpheus' lyre. Vega was the first star, after the Sun, ever photographed."],
  ["Men", "Mensa", "La Caille family", "Table Mountain", "Alpha Mensae", "1756", 153, "January", "Named after Cape Town's Table Mountain, with the Large Magellanic Cloud above it like the mountain's cloud cap."],
  ["Mic", "Microscopium", "La Caille family", "The microscope", "Gamma Microscopii", "1756", 210, "September", "A microscope, one of Lacaille's tributes to science. Faint, but it's all in the detail."],
  ["Mon", "Monoceros", "Orion family", "The unicorn", "Beta Monocerotis", "1612", 482, "February", "A unicorn standing inside the Winter Triangle, faint but full of star clusters."],
  ["Mus", "Musca", "Bayer family", "The fly", "Alpha Muscae", "1598", 138, "May", "A fly buzzing just south of the Southern Cross."],
  ["Nor", "Norma", "La Caille family", "The set square", "Gamma² Normae", "1756", 165, "July", "A carpenter's set square, drawn beside the Compasses."],
  ["Oct", "Octans", "La Caille family", "The octant", "Nu Octantis", "1756", 291, "October", "A navigator's octant, sitting on the south celestial pole. The south has no bright pole star, only faint Sigma Octantis."],
  ["Oph", "Ophiuchus", "Hercules family", "The serpent-bearer", "Rasalhague", "Ancient", 948, "July", "Asclepius the healer, holding a great snake. The Sun passes through it every December, yet it never made the zodiac."],
  ["Ori", "Orion", "Orion family", "The hunter", "Rigel", "Ancient", 594, "January", "Orion the hunter and his three-star belt. The nebula below the belt is a nursery where stars are born."],
  ["Pav", "Pavo", "Bayer family", "The peacock", "Peacock", "1598", 378, "September", "A peacock, whose brightest star is simply called Peacock."],
  ["Peg", "Pegasus", "Perseus family", "The winged horse", "Enif", "Ancient", 1121, "October", "The winged horse that sprang from Medusa. Look for the Great Square."],
  ["Per", "Perseus", "Perseus family", "The hero", "Mirfak", "Ancient", 615, "December", "Perseus, holding Medusa's head. The Perseid meteors radiate from here every August."],
  ["Phe", "Phoenix", "Bayer family", "The phoenix", "Ankaa", "1598", 469, "November", "The bird that rises from its own ashes. Good for a fresh start."],
  ["Pic", "Pictor", "La Caille family", "The painter's easel", "Alpha Pictoris", "1756", 247, "January", "A painter's easel. Its star Beta Pictoris has a young planetary system still taking shape."],
  ["Psc", "Pisces", "Zodiac", "The fish", "Alpherg", "Ancient", 889, "November", "Two fish tied by a cord: Aphrodite and Eros escaping Typhon. The Sun crosses the equator here each March."],
  ["PsA", "Piscis Austrinus", "Heavenly Waters", "The southern fish", "Fomalhaut", "Ancient", 245, "October", "A lone fish drinking the water Aquarius pours. Fomalhaut means \"mouth of the fish\"."],
  ["Pup", "Puppis", "Heavenly Waters", "The stern", "Naos", "1756", 673, "February", "The stern of the Argo, the largest of the ship's three pieces."],
  ["Pyx", "Pyxis", "Heavenly Waters", "The ship's compass", "Alpha Pyxidis", "1756", 221, "March", "A mariner's compass, set beside the Argo by Lacaille."],
  ["Ret", "Reticulum", "La Caille family", "The reticle", "Alpha Reticuli", "1756", 114, "January", "The crosshairs in Lacaille's telescope eyepiece. Small, neat and diamond-shaped."],
  ["Sge", "Sagitta", "Hercules family", "The arrow", "Gamma Sagittae", "Ancient", 80, "August", "An arrow, perhaps the one Hercules loosed at the eagle. The third-smallest constellation."],
  ["Sgr", "Sagittarius", "Zodiac", "The archer", "Kaus Australis", "Ancient", 867, "August", "A centaur archer aiming at the Scorpion's heart. The centre of the Milky Way lies behind its Teapot."],
  ["Sco", "Scorpius", "Zodiac", "The scorpion", "Antares", "Ancient", 497, "July", "The scorpion that killed Orion, which is why they never share the sky. Antares is its red heart."],
  ["Scl", "Sculptor", "La Caille family", "The sculptor's studio", "Alpha Sculptoris", "1756", 475, "November", "A sculptor's studio. Look here and you're looking straight out of the Milky Way's disc."],
  ["Sct", "Scutum", "Hercules family", "The shield", "Alpha Scuti", "1684", 109, "August", "The shield of King Jan III Sobieski of Poland, set in a bright patch of the Milky Way."],
  ["Ser", "Serpens", "Hercules family", "The serpent", "Unukalhai", "Ancient", 637, "July", "The snake held by Ophiuchus, and the only constellation split in two: the Head and the Tail."],
  ["Sex", "Sextans", "Hercules family", "The sextant", "Alpha Sextantis", "1687", 314, "April", "Hevelius' sextant, the instrument he lost when his observatory burned in 1679."],
  ["Tau", "Taurus", "Zodiac", "The bull", "Aldebaran", "Ancient", 797, "January", "Zeus as a white bull. Aldebaran is its eye, and the Pleiades ride on its shoulder."],
  ["Tel", "Telescopium", "La Caille family", "The telescope", "Alpha Telescopii", "1756", 252, "August", "A telescope, drawn by Lacaille. Fittingly, you'll want a clear night to see it."],
  ["Tri", "Triangulum", "Perseus family", "The triangle", "Beta Trianguli", "Ancient", 132, "December", "A plain triangle, one of the oldest shapes in the sky. It holds the Triangulum Galaxy."],
  ["TrA", "Triangulum Australe", "Hercules family", "The southern triangle", "Atria", "1598", 110, "July", "A bright southern triangle near Alpha Centauri, easier to spot than its northern twin."],
  ["Tuc", "Tucana", "Bayer family", "The toucan", "Alpha Tucanae", "1598", 295, "November", "A toucan with the Small Magellanic Cloud tucked under its wing."],
  ["UMa", "Ursa Major", "Ursa Major family", "The great bear", "Alioth", "Ancient", 1280, "April", "The Great Bear. Its tail and hip make the Big Dipper, which points the way to the pole star."],
  ["UMi", "Ursa Minor", "Ursa Major family", "The little bear", "Polaris", "Ancient", 256, "June", "The Little Bear, with Polaris at the tip of its tail. The whole northern sky turns around it."],
  ["Vel", "Vela", "Heavenly Waters", "The sails", "Gamma Velorum", "1756", 500, "March", "The sails of the Argo, and the remains of a star that exploded about 11,000 years ago."],
  ["Vir", "Virgo", "Zodiac", "The maiden", "Spica", "Ancient", 1294, "May", "The maiden holding an ear of wheat, Spica. The second-largest constellation."],
  ["Vol", "Volans", "Bayer family", "The flying fish", "Beta Volantis", "1598", 141, "February", "A flying fish leaping from the sea, as sailors saw them in southern waters."],
  ["Vul", "Vulpecula", "Hercules family", "The little fox", "Anser", "1687", 268, "September", "A fox with a goose in its jaws, drawn by Hevelius. Home to the Dumbbell Nebula."],
];

function slug(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z]+/g, "-");
}

/** Which half of the sky the figure sits in, from where its stars actually are. */
function hemisphereOf(abbr: string): Hemisphere {
  const [south, north] = CONSTELLATION_ART[abbr].dec;
  const middle = (south + north) / 2;
  if (south < 0 && north > 0 && Math.abs(middle) < 12) return "Equator";
  return middle > 0 ? "Northern" : "Southern";
}

export const ATLAS: AtlasEntry[] = ROWS.map(([abbr, name, family, meaning, brightest, charted, area, bestMonth, description]) => ({
  abbr, id: slug(name), name, family, meaning, description, brightest, charted, bestMonth,
  areaPercent: (area / SKY_SQUARE_DEGREES) * 100,
  hemisphere: hemisphereOf(abbr),
}))
  // The long game: small figures first, so each card takes a little longer than the last.
  .sort((a, b) => CONSTELLATION_ART[a.abbr].points.length - CONSTELLATION_ART[b.abbr].points.length
    || CONSTELLATION_ART[a.abbr].mags[0] - CONSTELLATION_ART[b.abbr].mags[0]);
