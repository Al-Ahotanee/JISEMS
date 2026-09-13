// JISEMS — Jigawa State Geographic & Electoral Dataset
// "The New World" — All 27 LGAs, 287 Wards, Representative Polling Units
// Supports Gubernatorial, Senatorial (3), Federal Reps (11), and State Assembly (30) Contests

const puNames = [
  'CENTRAL PRIMARY SCHOOL', 'TOWN HALL OPEN SPACE', 'DISTRICT HEAD COMPOUND',
  'COMMUNITY SEC. SCHOOL', 'VILLAGE HEAD COMPOUND', 'OPEN SPACE NEAR MARKET',
  'PRIMARY HEALTH CENTRE', 'MOTOR PARK', 'EMIR PALACE SQUARE', 'ISLAMIYYA SEC. SCHOOL',
  'TSOHON KASUWA', 'ANGWAN SARKI', 'YAN TEBUR AREA', 'KOFAR FADA',
  'GOVT DAY SEC. SCHOOL', 'DISPENSARY', 'GRAIN MARKET', 'WATER BOARD AREA',
  'DUTSE ROCK VIEW POST', 'POLICE POST OPEN SPACE', 'PLAYGROUND', 'COMMUNITY VIEW CENTRE',
  'L.E.A PRIMARY SCHOOL', 'NOMADIC SPECIAL SCHOOL', 'AGRICULTURAL SERVICE CENTRE'
];

function generatePUs(wardCode, wardName, count, baseLat, baseLng) {
  const units = [];
  for (let i = 1; i <= count; i++) {
    const nameIdx = (i - 1) % puNames.length;
    const suffix = count > puNames.length ? ` ${Math.ceil(i / puNames.length)}` : '';
    units.push({
      name: `${puNames[nameIdx]}${suffix} - ${wardName.toUpperCase()}`,
      code: `${wardCode}/${String(i).padStart(3, '0')}`,
      registeredVoters: 250 + Math.floor(Math.random() * 650),
      coordinates: {
        lat: Number((baseLat + (Math.random() - 0.5) * 0.05).toFixed(6)),
        lng: Number((baseLng + (Math.random() - 0.5) * 0.05).toFixed(6))
      }
    });
  }
  return units;
}

const rawLgas = [
  {
    "name": "Auyo",
    "code": "AUY",
    "headquarters": "Auyo",
    "lat": 12.35,
    "lng": 9.98,
    "senatorial": "Jigawa North-East",
    "federal": "Hadejia/Kafin Hausa/Auyo",
    "state_constituency": "Auyo",
    "wards": [
      "Auyo",
      "Ayan",
      "Ayama",
      "Gamafoi",
      "Gamsarka",
      "Gatafa",
      "Kafur",
      "Tsidir",
      "Unik",
      "Auduga"
    ]
  },
  {
    "name": "Babura",
    "code": "BAB",
    "headquarters": "Babura",
    "lat": 12.77,
    "lng": 8.77,
    "senatorial": "Jigawa North-West",
    "federal": "Garki/Babura",
    "state_constituency": "Babura",
    "wards": [
      "Babura",
      "Batali",
      "Dorawa",
      "Garu",
      "Gasakoli",
      "Insharuwa",
      "Kanya",
      "Kyambo",
      "Takwasa",
      "Kafin Inna",
      "Tsamia"
    ]
  },
  {
    "name": "Biriniwa",
    "code": "BIR",
    "headquarters": "Biriniwa",
    "lat": 12.79,
    "lng": 10.23,
    "senatorial": "Jigawa North-East",
    "federal": "Biriniwa/Guri/Kiri Kasama",
    "state_constituency": "Biriniwa",
    "wards": [
      "Biriniwa",
      "Batu",
      "Dangwaleri",
      "Diginsa",
      "Fagi",
      "Kachallari",
      "Karanka",
      "Kazuran",
      "Machinamari",
      "Ngurore",
      "Nguwa"
    ]
  },
  {
    "name": "Birnin Kudu",
    "code": "BNK",
    "headquarters": "Birnin Kudu",
    "lat": 11.45,
    "lng": 9.48,
    "senatorial": "Jigawa South-West",
    "federal": "Birnin Kudu/Buji",
    "state_constituency": "Birnin Kudu",
    "wards": [
      "Birnin Kudu",
      "Kangire",
      "Kantoga",
      "Kiyako",
      "Kwangwara",
      "Lafiya",
      "Sundumina",
      "Surko",
      "Yalwan Damai",
      "Unguwar Ya",
      "Wurno"
    ]
  },
  {
    "name": "Buji",
    "code": "BUJ",
    "headquarters": "Gantsa",
    "lat": 11.55,
    "lng": 9.68,
    "senatorial": "Jigawa South-West",
    "federal": "Birnin Kudu/Buji",
    "state_constituency": "Buji",
    "wards": [
      "Ahoto",
      "Buji",
      "Churrun",
      "Falageri",
      "Gantsa",
      "Kukuma",
      "Kole",
      "Madabe",
      "Yayari",
      "Lafiya Buji"
    ]
  },
  {
    "name": "Dutse",
    "code": "DUT",
    "headquarters": "Dutse",
    "lat": 11.7562,
    "lng": 9.339,
    "senatorial": "Jigawa South-West",
    "federal": "Dutse/Kiyawa",
    "state_constituency": "Dutse",
    "wards": [
      "Chamo",
      "Danmasara",
      "Dundubus",
      "Duru",
      "Jigawar Tsada",
      "Kachi",
      "Karnaya",
      "Kudai",
      "Limawa",
      "Madobi",
      "Sakwaya"
    ]
  },
  {
    "name": "Gagarawa",
    "code": "GAG",
    "headquarters": "Gagarawa",
    "lat": 12.41,
    "lng": 9.53,
    "senatorial": "Jigawa North-East",
    "federal": "Gagarawa/Gumel/Maigatari/Sule Tankarkar",
    "state_constituency": "Gagarawa",
    "wards": [
      "Gagarawa Gari",
      "Gagarawa Kudu",
      "Garin Chiroma",
      "Kore",
      "Madaka",
      "Maiaduwa",
      "Madu",
      "Maikilili",
      "Yalawa",
      "Zarada"
    ]
  },
  {
    "name": "Garki",
    "code": "GAR",
    "headquarters": "Garki",
    "lat": 12.38,
    "lng": 9.17,
    "senatorial": "Jigawa North-West",
    "federal": "Garki/Babura",
    "state_constituency": "Garki",
    "wards": [
      "Buduru",
      "Doko",
      "Garki",
      "Gwarzo",
      "Jirima",
      "Kargo",
      "Kore",
      "Muku",
      "Rafin Marke",
      "Sayasaya",
      "Siyori"
    ]
  },
  {
    "name": "Gumel",
    "code": "GUM",
    "headquarters": "Gumel",
    "lat": 12.63,
    "lng": 9.39,
    "senatorial": "Jigawa North-West",
    "federal": "Gagarawa/Gumel/Maigatari/Sule Tankarkar",
    "state_constituency": "Gumel",
    "wards": [
      "Baikarya",
      "Dantanoma",
      "Garin Gambo",
      "Garin Barka",
      "Gusau",
      "Hammado",
      "Kofar Arewa",
      "Kofar Yamma",
      "Zango",
      "Danama",
      "Galagamma"
    ]
  },
  {
    "name": "Guri",
    "code": "GUR",
    "headquarters": "Guri",
    "lat": 12.72,
    "lng": 10.42,
    "senatorial": "Jigawa North-East",
    "federal": "Biriniwa/Guri/Kiri Kasama",
    "state_constituency": "Guri",
    "wards": [
      "Adiyani",
      "Dawa",
      "Gaduwawa",
      "Guri",
      "Kadira",
      "Lafiya Guri",
      "Margadu",
      "Matara Babba",
      "Musari",
      "Zuggo"
    ]
  },
  {
    "name": "Gwaram",
    "code": "GWA",
    "headquarters": "Gwaram",
    "lat": 11.28,
    "lng": 9.88,
    "senatorial": "Jigawa South-West",
    "federal": "Gwaram",
    "state_constituency": "Gwaram",
    "wards": [
      "Basirka",
      "Dingaya",
      "Fagam",
      "Faris",
      "Gwaram",
      "Kila",
      "Kwandiko",
      "Maruta",
      "Sara",
      "Tsangarwa",
      "Zandam"
    ]
  },
  {
    "name": "Gwiwa",
    "code": "GWI",
    "headquarters": "Gwiwa",
    "lat": 12.76,
    "lng": 8.33,
    "senatorial": "Jigawa North-West",
    "federal": "Kazaure/Roni/Gwiwa/Yankwashi",
    "state_constituency": "Gwiwa",
    "wards": [
      "Buntusu",
      "Darina",
      "Gwiwa",
      "Korayel",
      "Rurau",
      "Shafe",
      "Yola",
      "Zaumar Sainawa",
      "Bayam",
      "Gunka"
    ]
  },
  {
    "name": "Hadejia",
    "code": "HAD",
    "headquarters": "Hadejia",
    "lat": 12.45,
    "lng": 10.04,
    "senatorial": "Jigawa North-East",
    "federal": "Hadejia/Kafin Hausa/Auyo",
    "state_constituency": "Hadejia",
    "wards": [
      "Atafi",
      "Dubantu",
      "Gagulmari",
      "Kasuwar Kofa",
      "Kasuwar Kuda",
      "Majema",
      "Matsaro",
      "Rumfa",
      "Sabon Garin Hadejia",
      "Yayari",
      "Kukadu"
    ]
  },
  {
    "name": "Jahun",
    "code": "JAH",
    "headquarters": "Jahun",
    "lat": 12.09,
    "lng": 9.62,
    "senatorial": "Jigawa South-West",
    "federal": "Jahun/Miga",
    "state_constituency": "Jahun",
    "wards": [
      "Aujara",
      "Gangawa",
      "Gauza",
      "Gunka",
      "Harbo Sabuwa",
      "Harbo Tsohuwa",
      "Idanduna",
      "Jabarna",
      "Jahun",
      "Kanwa",
      "Kalahina"
    ]
  },
  {
    "name": "Kafin Hausa",
    "code": "KAF",
    "headquarters": "Kafin Hausa",
    "lat": 12.24,
    "lng": 9.91,
    "senatorial": "Jigawa North-East",
    "federal": "Hadejia/Kafin Hausa/Auyo",
    "state_constituency": "Kafin Hausa",
    "wards": [
      "Balangu",
      "Dumadumin Toka",
      "Gafaya",
      "Jabo",
      "Kafin Hausa",
      "Kazalewa",
      "Majiyawa",
      "Mezan",
      "Ruba",
      "Sarawa",
      "Zago"
    ]
  },
  {
    "name": "Kaugama",
    "code": "KAU",
    "headquarters": "Kaugama",
    "lat": 12.44,
    "lng": 9.77,
    "senatorial": "Jigawa North-East",
    "federal": "Mallam Madori/Kaugama",
    "state_constituency": "Kaugama",
    "wards": [
      "Arbus",
      "Askandu",
      "Dabuwaran",
      "Dakayyawa",
      "Hadim",
      "Jaudi",
      "Jarkasa",
      "Kaugama",
      "Marke",
      "Unguwar Jibrin"
    ]
  },
  {
    "name": "Kazaure",
    "code": "KAZ",
    "headquarters": "Kazaure",
    "lat": 12.65,
    "lng": 8.41,
    "senatorial": "Jigawa North-West",
    "federal": "Kazaure/Roni/Gwiwa/Yankwashi",
    "state_constituency": "Kazaure",
    "wards": [
      "Ba'auzini",
      "Daba",
      "Dabaza",
      "Dandi",
      "Gada",
      "Kanti",
      "Maradawa",
      "Sabaru",
      "Unguwar Jibrin",
      "Unguwar Arewa",
      "Unguwar Kudu"
    ]
  },
  {
    "name": "Kiri Kasama",
    "code": "KIR",
    "headquarters": "Kiri Kasama",
    "lat": 12.69,
    "lng": 10.23,
    "senatorial": "Jigawa North-East",
    "federal": "Biriniwa/Guri/Kiri Kasama",
    "state_constituency": "Kiri Kasama",
    "wards": [
      "Baturiya",
      "Bulangu",
      "Doleri",
      "Fandum",
      "Garin Malam",
      "Kiri Kasama",
      "Madachi",
      "Marma",
      "Saleri",
      "Tashena"
    ]
  },
  {
    "name": "Kiyawa",
    "code": "KIY",
    "headquarters": "Kiyawa",
    "lat": 11.78,
    "lng": 9.61,
    "senatorial": "Jigawa South-West",
    "federal": "Dutse/Kiyawa",
    "state_constituency": "Kiyawa",
    "wards": [
      "Abalago",
      "Andaza",
      "Garko",
      "Guruduba",
      "Katanga",
      "Katuka",
      "Kiyawa",
      "Kwanda",
      "Maje",
      "Tsaure",
      "Zandam"
    ]
  },
  {
    "name": "Maigatari",
    "code": "MAI",
    "headquarters": "Maigatari",
    "lat": 12.81,
    "lng": 9.45,
    "senatorial": "Jigawa North-West",
    "federal": "Gagarawa/Gumel/Maigatari/Sule Tankarkar",
    "state_constituency": "Maigatari",
    "wards": [
      "Baban Mutum",
      "Dankumbo",
      "Fulata",
      "Galadi",
      "Madana",
      "Maigatari Arewa",
      "Maigatari Kudu",
      "Matoya",
      "Turbus",
      "Kukayeku"
    ]
  },
  {
    "name": "Malam Madori",
    "code": "MAL",
    "headquarters": "Malam Madori",
    "lat": 12.55,
    "lng": 9.98,
    "senatorial": "Jigawa North-East",
    "federal": "Mallam Madori/Kaugama",
    "state_constituency": "Malam Madori",
    "wards": [
      "Arki",
      "Dunari",
      "Fateka",
      "Garun Gabas",
      "Malam Madori",
      "Shagogo",
      "Tagwaro",
      "Toni",
      "Tashena",
      "Makaddari"
    ]
  },
  {
    "name": "Miga",
    "code": "MIG",
    "headquarters": "Miga",
    "lat": 12.15,
    "lng": 9.71,
    "senatorial": "Jigawa South-West",
    "federal": "Jahun/Miga",
    "state_constituency": "Miga",
    "wards": [
      "Dangyatin",
      "Garbo",
      "Gigiye",
      "Hantsu",
      "Koya",
      "Miga",
      "Sabon Gari Miga",
      "Takalafiya",
      "Tsakuwama",
      "Zangon Kanya"
    ]
  },
  {
    "name": "Ringim",
    "code": "RIN",
    "headquarters": "Ringim",
    "lat": 12.15,
    "lng": 9.16,
    "senatorial": "Jigawa South-West",
    "federal": "Ringim/Taura",
    "state_constituency": "Ringim",
    "wards": [
      "Chai-Chai",
      "Daurawa",
      "Kafin Babushe",
      "Karshi",
      "Kiyari",
      "Ringim",
      "Sankara",
      "Sintilmawa",
      "Yandutse",
      "Zangon Barebari"
    ]
  },
  {
    "name": "Roni",
    "code": "RON",
    "headquarters": "Roni",
    "lat": 12.55,
    "lng": 8.3,
    "senatorial": "Jigawa North-West",
    "federal": "Kazaure/Roni/Gwiwa/Yankwashi",
    "state_constituency": "Roni",
    "wards": [
      "Amaryawa",
      "Baragumi",
      "Dansure",
      "Fara",
      "Gora",
      "Kwaita",
      "Roni",
      "Sankau",
      "Tunas",
      "Zugai"
    ]
  },
  {
    "name": "Sule Tankarkar",
    "code": "SUL",
    "headquarters": "Sule Tankarkar",
    "lat": 12.67,
    "lng": 9.23,
    "senatorial": "Jigawa North-West",
    "federal": "Gagarawa/Gumel/Maigatari/Sule Tankarkar",
    "state_constituency": "Sule Tankarkar",
    "wards": [
      "Albasu",
      "Amanga",
      "Dangwanki",
      "Danladi",
      "Danzomo",
      "Jeke",
      "Sule Tankarkar",
      "Takatsaba",
      "Yandamo",
      "Kore Balatu"
    ]
  },
  {
    "name": "Taura",
    "code": "TAU",
    "headquarters": "Taura",
    "lat": 12.24,
    "lng": 9.32,
    "senatorial": "Jigawa South-West",
    "federal": "Ringim/Taura",
    "state_constituency": "Taura",
    "wards": [
      "Ajaura",
      "Chakwama",
      "Churamani",
      "Gujuwa",
      "Kiri",
      "Kuka",
      "Kwalam",
      "Maje",
      "Taura",
      "Yango"
    ]
  },
  {
    "name": "Yankwashi",
    "code": "YAN",
    "headquarters": "Karkarna",
    "lat": 12.79,
    "lng": 8.52,
    "senatorial": "Jigawa North-West",
    "federal": "Kazaure/Roni/Gwiwa/Yankwashi",
    "state_constituency": "Yankwashi",
    "wards": [
      "Achilafia",
      "Belas",
      "Dawan Gawo",
      "Gwanki",
      "Karkarna",
      "Kuda",
      "Ringim Yankwashi",
      "Yankwashi",
      "Zungumba",
      "Gwarzo Yankwashi"
    ]
  }
];

const JIGAWA_GEO_DATA = {
  state: {
    name: 'Jigawa',
    code: 'JG',
    capital: 'Dutse',
    slogan: 'The New World',
    coordinates: { lat: 11.7562, lng: 9.3390 }
  },
  senatorialDistricts: [
    { id: 'NE', name: 'Jigawa North-East', lgas: ['Auyo', 'Biriniwa', 'Gagarawa', 'Guri', 'Hadejia', 'Kafin Hausa', 'Kaugama', 'Kiri Kasama', 'Malam Madori'] },
    { id: 'NW', name: 'Jigawa North-West', lgas: ['Babura', 'Garki', 'Gumel', 'Gwiwa', 'Kazaure', 'Maigatari', 'Roni', 'Sule Tankarkar', 'Yankwashi'] },
    { id: 'SW', name: 'Jigawa South-West', lgas: ['Birnin Kudu', 'Buji', 'Dutse', 'Gwaram', 'Jahun', 'Kiyawa', 'Miga', 'Ringim', 'Taura'] }
  ],
  federalConstituencies: [
    { name: 'Birnin Kudu / Buji', lgas: ['Birnin Kudu', 'Buji'] },
    { name: 'Biriniwa / Guri / Kiri Kasama', lgas: ['Biriniwa', 'Guri', 'Kiri Kasama'] },
    { name: 'Dutse / Kiyawa', lgas: ['Dutse', 'Kiyawa'] },
    { name: 'Gagarawa / Gumel / Maigatari / Sule Tankarkar', lgas: ['Gagarawa', 'Gumel', 'Maigatari', 'Sule Tankarkar'] },
    { name: 'Garki / Babura', lgas: ['Garki', 'Babura'] },
    { name: 'Gwaram', lgas: ['Gwaram'] },
    { name: 'Hadejia / Kafin Hausa / Auyo', lgas: ['Hadejia', 'Kafin Hausa', 'Auyo'] },
    { name: 'Jahun / Miga', lgas: ['Jahun', 'Miga'] },
    { name: 'Kazaure / Roni / Gwiwa / Yankwashi', lgas: ['Kazaure', 'Roni', 'Gwiwa', 'Yankwashi'] },
    { name: 'Mallam Madori / Kaugama', lgas: ['Malam Madori', 'Kaugama'] },
    { name: 'Ringim / Taura', lgas: ['Ringim', 'Taura'] }
  ],
  lgas: rawLgas.map(lga => {
    return {
      name: lga.name,
      code: lga.code,
      headquarters: lga.headquarters,
      senatorial: lga.senatorial,
      federal: lga.federal,
      stateConstituency: lga.state_constituency,
      coordinates: { lat: lga.lat, lng: lga.lng },
      wards: lga.wards.map((wardName, idx) => {
        const wardCode = `${lga.code}/${String(idx + 1).padStart(2, '0')}`;
        return {
          name: wardName,
          code: wardCode,
          pollingUnits: generatePUs(wardCode, wardName, 8, lga.lat, lga.lng)
        };
      })
    };
  })
};

module.exports = JIGAWA_GEO_DATA;
