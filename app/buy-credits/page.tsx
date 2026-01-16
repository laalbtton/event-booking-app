export default function BuyCreditsPage() {
    return (
      <div className="min-h-screen bg-gray-100 py-12 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Buy Credits</h1>
          
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-2">During Alpha Testing</h3>
            <p className="text-blue-800">
              We're currently in testing phase. To purchase credits:
            </p>
          </div>
  
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">Step 1: Send E-Transfer</h3>
              <p className="text-gray-600 mb-2">Send an Interac e-Transfer to:</p>
              <p className="text-xl font-bold text-blue-600">billing@laalbutton.com</p>
              <p className="text-sm text-gray-500 mt-2">
                Amount: $1 = 1 credit (minimum $10)
              </p>
            </div>
  
            <div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">Step 2: Include Your Email</h3>
              <p className="text-gray-600">
                In the e-Transfer message, include the email you used to sign up.
              </p>
            </div>
  
            <div>
              <h3 className="font-semibold text-lg text-gray-900 mb-2">Step 3: Wait for Confirmation</h3>
              <p className="text-gray-600">
                We'll manually add credits to your account within 24 hours and send you a confirmation email.
              </p>
            </div>
  
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 text-sm">
                💡 <strong>Coming Soon:</strong> Instant credit purchase with automatic processing!
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }