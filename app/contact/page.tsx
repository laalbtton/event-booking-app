'use client'

import NavigationTabs from '@/components/NavigationTabs'

export default function ContactPage() {
    return (
      <div className="min-h-screen bg-gray-100 py-12 px-4 pb-20">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Contact Us</h1>
          <p className="text-gray-600 mb-6">
            Have questions or need help? We're here for you!
          </p>
          
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900">Email</h3>
              <a href="mailto:events@laalbutton.com" className="text-blue-600 hover:underline">
                events@laalbutton.com
              </a>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900">Response Time</h3>
              <p className="text-gray-600">Within 48 hours</p>
            </div>
  
            <div>
              <h3 className="font-semibold text-gray-900">Common Questions</h3>
              <ul className="list-disc list-inside text-gray-600 space-y-1">
                <li>How do I book an event? → Browse events and click "Book Event"</li>
                <li>How do credits work? → Each event costs credits (usually 5)</li>
                <li>How do I buy credits? → Contact us via email for now</li>
                <li>Can I get a refund? → Yes, the refund policy is in the event details</li>
              </ul>
            </div>
          </div>
        </div>
        <NavigationTabs />
      </div>
    )
  }