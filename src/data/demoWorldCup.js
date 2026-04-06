export function buildDemoWorldCupBase(reason = "Live API-Football data is unavailable.") {
  const seededGroups = [
    ["A", ["Mexico", "Croatia", "Norway", "Jordan"]],
    ["B", ["Canada", "Morocco", "Panama", "Cabo Verde"]],
    ["C", ["Spain", "Colombia", "Egypt", "Ghana"]],
    ["D", ["USA", "Uruguay", "Algeria", "Curacao"]],
    ["E", ["Argentina", "Switzerland", "Scotland", "Haiti"]],
    ["F", ["France", "Japan", "Paraguay", "New Zealand"]],
    ["G", ["England", "Senegal", "Tunisia", "UEFA Play-Off A"]],
    ["H", ["Brazil", "IR Iran", "Cote d'Ivoire", "UEFA Play-Off B"]],
    ["I", ["Portugal", "Korea Republic", "Uzbekistan", "UEFA Play-Off C"]],
    ["J", ["Netherlands", "Ecuador", "Qatar", "UEFA Play-Off D"]],
    ["K", ["Belgium", "Austria", "Saudi Arabia", "FIFA Play-Off 1"]],
    ["L", ["Germany", "Australia", "South Africa", "FIFA Play-Off 2"]]
  ];

  const groups = seededGroups.map(([letter, teamNames]) => ({
    id: `group-${letter.toLowerCase()}`,
    letter,
    label: `Group ${letter}`,
    teams: teamNames.map((name, index) => ({
      id: `demo-${letter}-${index + 1}`,
      name,
      code: name
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 3)
        .toUpperCase(),
      country: name,
      logo: null,
      groupLetter: letter,
      standing: {
        rank: index + 1,
        points: null,
        goalDifference: null,
        form: null,
        played: null,
        wins: null,
        draws: null,
        losses: null,
        goalsFor: null,
        goalsAgainst: null,
        description: null,
        update: null
      }
    }))
  }));

  return {
    source: {
      mode: "demo",
      provider: "API-Football",
      documentation: "https://www.api-football.com/documentation-v3",
      scheduleSource: "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums",
      fetchedAt: new Date().toISOString(),
      warnings: [
        `${reason} The page is rendering a local demo field so the drag-and-save flow can still be tested.`,
        "The demo groups are based on pot order and placeholders, not the real final draw."
      ]
    },
    competition: {
      id: null,
      name: "FIFA World Cup 2026",
      country: "World",
      season: 2026,
      coverage: {
        standings: false,
        fixtures: {
          events: false,
          lineups: false,
          statistics_fixtures: false,
          statistics_players: false
        }
      }
    },
    groups,
    fixtures: [],
    rounds: [],
    venues: [],
    featuredStats: []
  };
}
