import React, { useState, useRef } from 'react';
import { Key } from 'lucide-react';
import { Button } from '../components/SharedUI';

const PinSetupPage = ({ navigate }) => {
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef([]);

  const handleChange = (index, value) => {
    if (value.length > 1) value = value.slice(-1);
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < 5) inputRefs.current[index + 1].focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-indigo-500/20 border border-indigo-500/30 mb-4">
          <Key className="h-8 w-8 text-indigo-400" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-100 mb-2">Protect Encrypted Files</h2>
        <p className="text-slate-400 text-sm mb-8 px-4">
          Set a 6-digit account PIN to access files stored in Encrypted mode. This is separate from your login password and provides an extra layer of zero-knowledge security.
        </p>

        <div className="bg-slate-900 py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-800">
          <div className="flex justify-center space-x-2 mb-8">
            {pin.map((digit, idx) => (
              <input
                key={idx}
                ref={el => inputRefs.current[idx] = el}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-12 h-14 text-center text-2xl font-bold text-white bg-slate-950 border border-slate-700 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-colors"
              />
            ))}
          </div>

          <div className="flex flex-col space-y-3">
            <Button variant="primary" onClick={() => navigate('dashboard')} disabled={pin.join('').length < 6} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white focus:ring-indigo-500">
              Set Security PIN
            </Button>
            <Button variant="ghost" onClick={() => navigate('dashboard')} className="w-full">
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PinSetupPage;