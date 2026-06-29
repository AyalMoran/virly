// fill-personal-details.api.js
//
// Run with:
// npm run seed:personal-details
//
// Or against local API:
// API_BASE_URL="http://localhost:3000" npm run seed:personal-details

const API_BASE_URL = process.env.API_BASE_URL ?? "https://api.virly.ayal.online";
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD ?? "admin1234";

const passwordsByEmail = {
  "sga@thunder.com": process.env.SGA_PASSWORD ?? DEFAULT_PASSWORD,
  "lebron@lakers.com": process.env.LEBRON_PASSWORD ?? DEFAULT_PASSWORD,
  "admin@admin.com": process.env.ADMIN_PASSWORD ?? DEFAULT_PASSWORD,
  "moranayal@gmail.com": process.env.MORANAYAL_PASSWORD ?? DEFAULT_PASSWORD,
  "deni@trailblazers.com": process.env.DENI_PASSWORD ?? DEFAULT_PASSWORD,
  "jokic@nuggets.com": process.env.JOKIC_PASSWORD ?? DEFAULT_PASSWORD,
  "luka@lakers.com": process.env.LUKA_PASSWORD ?? DEFAULT_PASSWORD
};

const personalDetailsByEmail = {
  "sga@thunder.com": {
    firstName: "שיי",
    lastName: "גילג'ס-אלכסנדר",
    dateOfBirth: "1998-07-12",
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
    firstName: "לברון",
    lastName: "ג'יימס",
    dateOfBirth: "1984-12-30",
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
    firstName: "מנהל",
    lastName: "משתמש",
    dateOfBirth: "1990-01-01",
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
    firstName: "אייל",
    lastName: "מורן",
    dateOfBirth: "1900-01-01",
    address: {
      country: "Israel",
      stateRegion: "Center District",
      city: "Petah Tikva",
      street: "Petah Tikva Street",
      addressLine2: null,
      postalCode: "75000"
    }
  },

  "deni@trailblazers.com": {
    firstName: "דני",
    lastName: "אבדיה",
    dateOfBirth: "2001-01-03",
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
    firstName: "ניקולה",
    lastName: "יוקיץ'",
    dateOfBirth: "1995-02-19",
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
    firstName: "לוקה",
    lastName: "דונצ'יץ'",
    dateOfBirth: "1999-02-28",
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

function apiUrl(path) {
  return `${API_BASE_URL.replace(/\/+$/, "")}${path}`;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const combinedHeader = headers.get("set-cookie");
  return combinedHeader ? combinedHeader.split(/,\s*(?=[^=;,]+=)/) : [];
}

function getCookieValue(setCookieHeaders, cookieName) {
  for (const setCookieHeader of setCookieHeaders) {
    const cookie = setCookieHeader.split(";")[0];
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    if (cookie.slice(0, separatorIndex) === cookieName) {
      return cookie.slice(separatorIndex + 1);
    }
  }

  throw new Error(`Response did not include the ${cookieName} cookie.`);
}

async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

async function login(email) {
  const response = await fetch(apiUrl("/api/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password: passwordsByEmail[email]
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed for ${email}: ${await readResponseBody(response)}`);
  }

  const setCookieHeaders = getSetCookieHeaders(response.headers);
  const authCookie = getCookieValue(setCookieHeaders, "virly_auth");
  const csrfCookie = getCookieValue(setCookieHeaders, "virly_csrf");

  return {
    cookieHeader: `virly_auth=${authCookie}; virly_csrf=${csrfCookie}`,
    csrfToken: csrfCookie
  };
}

async function updatePersonalDetails(email, details) {
  const session = await login(email);
  const response = await fetch(apiUrl("/api/accounts/personal-details"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: session.cookieHeader,
      "X-CSRF-Token": session.csrfToken
    },
    body: JSON.stringify(details)
  });

  if (!response.ok) {
    throw new Error(`Update failed for ${email}: ${await readResponseBody(response)}`);
  }

  const responseBody = JSON.parse(await response.text());
  const personalDetails = responseBody.personalDetails;
  console.log(
    JSON.stringify({
      email,
      personalDetailsId: personalDetails.id,
      status: personalDetails.status,
      updatedName: `${personalDetails.firstName} ${personalDetails.lastName}`
    })
  );
}

async function main() {
  console.log(`Filling personal details through ${API_BASE_URL}...`);

  for (const [email, details] of Object.entries(personalDetailsByEmail)) {
    await updatePersonalDetails(email, details);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
