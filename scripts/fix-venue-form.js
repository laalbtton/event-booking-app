const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'events', 'manage', 'page.tsx');
const ls = fs.readFileSync(filePath, 'utf8').split('\n');

// Remove lines 1486-1597 (1-indexed) = 0-indexed 1485-1596
// and replace with clean block
const goodBlock = `
                <div className="space-y-2">
                  <Label htmlFor="create-venue">Venue *</Label>
                  <select
                    id="create-venue"
                    value={formData.venue_id}
                    onChange={(e) => setFormData({ ...formData, venue_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value="">Select a venue</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name} - {venue.address}
                      </option>
                    ))}
                  </select>

                  {!showVenueRequestForm ? (
                    <button
                      type="button"
                      onClick={() => setShowVenueRequestForm(true)}
                      className="text-sm text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      My venue isn&apos;t listed &mdash; request it
                    </button>
                  ) : (
                    <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
                      <p className="text-sm font-medium">Request a new venue</p>
                      <p className="text-xs text-muted-foreground">
                        A community admin will review it. Your event will also be held for review.
                      </p>
                      <div className="space-y-2">
                        <Input
                          placeholder="Venue name *"
                          value={venueRequestName}
                          onChange={(e) => setVenueRequestName(e.target.value)}
                        />
                        <Input
                          placeholder="Full address *"
                          value={venueRequestAddress}
                          onChange={(e) => setVenueRequestAddress(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          disabled={venueRequestSubmitting || !venueRequestName.trim() || !venueRequestAddress.trim()}
                          onClick={async () => {
                            setVenueRequestSubmitting(true)
                            try {
                              const { data: sessionData } = await supabase.auth.getSession()
                              const accessToken = sessionData.session?.access_token
                              if (!accessToken) throw new Error('Not authenticated')
                              const currentUser = (await supabase.auth.getUser()).data.user
                              const { data: memberships } = await supabase
                                .from('community_members')
                                .select('community_id')
                                .eq('user_id', currentUser?.id || '')
                                .in('role', ['event_creator', 'co_admin', 'admin'])
                                .limit(1)
                              const communityId = (memberships || [])[0]?.community_id || null
                              const res = await fetch('/api/venues/request', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: \`Bearer \${accessToken}\` },
                                body: JSON.stringify({ name: venueRequestName.trim(), address: venueRequestAddress.trim(), communityId }),
                              })
                              const json = await res.json()
                              if (!res.ok) throw new Error(json.error || 'Failed to submit venue')
                              setVenues(prev => [...prev, { id: json.venue.id, name: json.venue.name, address: json.venue.address }])
                              setFormData(prev => ({ ...prev, venue_id: json.venue.id }))
                              setShowVenueRequestForm(false)
                              setVenueRequestName('')
                              setVenueRequestAddress('')
                              toast.success('Venue submitted for review and selected for this event.')
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to submit venue')
                            } finally { setVenueRequestSubmitting(false) }
                          }}
                        >
                          {venueRequestSubmitting ? 'Submitting\u2026' : 'Submit Venue Request'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setShowVenueRequestForm(false); setVenueRequestName(''); setVenueRequestAddress('') }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>`;

// Replace lines 1486-1597 (1-indexed) with the good block
// 0-indexed: 1485-1596, count = 1596-1485+1 = 112
ls.splice(1485, 112, ...goodBlock.split('\n'));

fs.writeFileSync(filePath, ls.join('\n'), 'utf8');

// Verify
const newLines = fs.readFileSync(filePath, 'utf8').split('\n');
console.log('Done. Total lines:', newLines.length);
newLines.forEach((l, i) => {
  if (l.includes('create-venue')) console.log('create-venue at line', i + 1);
});
