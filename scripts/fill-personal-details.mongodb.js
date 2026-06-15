// fill-personal-details.mongodb.js
//
// Run with:
// mongosh "mongodb://localhost:27017/YOUR_DB_NAME" fill-personal-details.mongodb.js
//
// Or inside mongosh:
// load("fill-personal-details.mongodb.js")

const now = new Date();

const personalDetailsByEmail = {
  "sga@thunder.com": {
    firstName: "Shai",
    lastName: "Gilgeous-Alexander",
    dateOfBirth: new Date("1998-07-12"),
    address: {
      country: "USA",
      stateRegion: "Oklahoma",
      city: "Oklahoma City",
      street: "Thunder Arena Drive",
      addressLine2: null,
      postalCode: "73102"
    }
  },

  "lebron@lakers.com": {
    firstName: "LeBron",
    lastName: "James",
    dateOfBirth: new Date("1984-12-30"),
    address: {
      country: "USA",
      stateRegion: "California",
      city: "Los Angeles",
      street: "Lakers Drive",
      addressLine2: null,
      postalCode: "90015"
    }
  },

  "admin@admin.com": {
    firstName: "Admin",
    lastName: "User",
    dateOfBirth: new Date("1990-01-01"),
    address: {
      country: "Israel",
      stateRegion: "Center District",
      city: "Rishon LeZion",
      street: "Admin Street",
      addressLine2: null,
      postalCode: "75000"
    }
  },

  "moranayal@gmail.com": {
    firstName: "Ayal",
    lastName: "Moran",
    dateOfBirth: new Date("1995-01-01"),
    address: {
      country: "Israel",
      stateRegion: "Center District",
      city: "Rishon LeZion",
      street: "Moran Street",
      addressLine2: null,
      postalCode: "75000"
    }
  },

  "deni@trailblazers.com": {
    firstName: "Deni",
    lastName: "Avdija",
    dateOfBirth: new Date("2001-01-03"),
    address: {
      country: "USA",
      stateRegion: "Oregon",
      city: "Portland",
      street: "Trail Blazers Avenue",
      addressLine2: null,
      postalCode: "97227"
    }
  },

  "jokic@nuggets.com": {
    firstName: "Nikola",
    lastName: "Jokic",
    dateOfBirth: new Date("1995-02-19"),
    address: {
      country: "USA",
      stateRegion: "Colorado",
      city: "Denver",
      street: "Nuggets Street",
      addressLine2: null,
      postalCode: "80204"
    }
  },

  "luka@lakers.com": {
    firstName: "Luka",
    lastName: "Doncic",
    dateOfBirth: new Date("1999-02-28"),
    address: {
      country: "USA",
      stateRegion: "California",
      city: "Los Angeles",
      street: "Lakers Drive",
      addressLine2: null,
      postalCode: "90015"
    }
  }
};

const emails = Object.keys(personalDetailsByEmail);

const users = db.users.find({
  email: { $in: emails },
  personalDetails: { $exists: true, $ne: null }
}).toArray();

print(`Found ${users.length} users with personalDetails reference.`);

for (const user of users) {
  const details = personalDetailsByEmail[user.email];

  if (!details) {
    print(`Skipping ${user.email}: no personal details fixture.`);
    continue;
  }

  const update = {
    $set: {
      userId: user._id,
      status: "provided",

      firstName: details.firstName,
      lastName: details.lastName,
      dateOfBirth: details.dateOfBirth,

      "address.country": details.address.country,
      "address.stateRegion": details.address.stateRegion,
      "address.city": details.address.city,
      "address.street": details.address.street,
      "address.addressLine2": details.address.addressLine2,
      "address.postalCode": details.address.postalCode,

      updatedAt: now
    },

    $unset: {
      lastSkippedAt: ""
    }
  };

  const result = db.personaldetails.updateOne(
    { _id: user.personalDetails },
    update
  );

  printjson({
    email: user.email,
    userId: user._id,
    personalDetailsId: user.personalDetails,
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount
  });
}

print("Done.");