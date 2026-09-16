// Single place for site identity, copy and contact addresses.
// Change this file rather than hunting for hardcoded strings elsewhere.

export const config = {
  // Site name and domain decided by the owner, see SPEC.md section 18.
  siteName: 'CBR EDM',

  slogan: 'No social media? - The info you need, for those with no feed',

  // Board column labels, section 7.1. Defaults from the spec, "Been and
  // gone" renamed to "Past events" per owner request.
  boardColumns: {
    upcoming: 'Coming up',
    past: 'Past events',
  },

  // Acknowledgement of Country, section 15.3. Empty string hides it entirely.
  // Owner has decided to omit this for now rather than guess at wording
  // without it being checked by an Aboriginal elder first (see SPEC.md
  // section 18). Revisit if that changes.
  ackText: '',

  harmReductionTitle: 'Look after each other',

  // Public inbound address, shown on the contact page and footer.
  // Never the owner's personal address.
  contactAddress: 'events@cbredm.org',

  // Sender identity for admin alert emails, section 10.3. Must be on the
  // same domain as contactAddress, per the Email Routing setup in README.md.
  noreplyAddress: 'noreply@cbredm.org',

  reminderBanner: {
    fromDate: '2027-04-01',
    text: 'CanTEST funding was due to end June 2027. Check the service is still running.',
  },
};
