const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'events', 'manage', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find first occurrence of id="create-venue" (the CREATE form, not EDIT form)
const targetLine = lines.findIndex(l => l.includes('id="create-venue"'));
if (targetLine === -1) { console.error('Not found'); process.exit(1); }

console.log('Found create-venue at line', targetLine + 1);

// The block starts 3 lines before (the enclosing <div>)
const blockStart = targetLine - 3;

// Find the closing </div> of this section
let depth = 0;
let blockEnd = blockStart;
for (let i = blockStart; i < lines.length; i++) {
  const l = lines[i];
  // Count div opens/closes
  const opens = (l.match(/<div/g) || []).length;
  const closes = (l.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (i > blockStart && depth <= 0) {
    blockEnd = i;
    break;
  }
}

console.log('Block spans lines', blockStart + 1, 'to', blockEnd + 1);

const newBlock = `                <div className="space-y-2">
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
                            } finally {
                              setVenueRequestSubmitting(false)
                            }
                          }}
                        >
                          {venueRequestSubmitting ? 'Submitting\u2026' : 'Submit Venue Request'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => { setShowVenueRequestForm(false); setVenueRequestName(''); setVenueRequestAddress('') }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>`;

lines.splice(blockStart, blockEnd - blockStart + 1, newBlock);
fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Done. Lines now:', lines.length);
