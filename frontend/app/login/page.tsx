'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import toast, { Toaster } from 'react-hot-toast';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAppStore();

  const [email, setEmail] = useState('reed.security@visionmed.hospital');
  const [password, setPassword] = useState('hospital123');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await login(email, password);
    setIsSubmitting(false);

    if (success) {
      toast.success('Login berhasil! Mengalihkan ke dashboard...', { icon: '🏥' });
      router.push('/');
    }
  };

  const handleSelectAccount = (accEmail: string) => {
    setEmail(accEmail);
    setPassword('hospital123');
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col items-center justify-center p-4">
      <Toaster position="top-right" />

      {/* Main Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden">
        {/* Top Header */}
        <div className="bg-slate-900 text-white p-6 text-center border-b border-slate-800 relative">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-tr from-[#0284c7] to-[#06b6d4] flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 mb-3">
            <span className="font-extrabold text-2xl leading-none">+</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Vision<span className="text-[#0284c7]">Med</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Clinical Surveillance & Emergency Detection System
          </p>

          <div className="inline-flex items-center gap-1.5 mt-3 bg-slate-800/80 text-emerald-400 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>RESTRICTED SINGLE-ACCOUNT ACCESS</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6">
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Peraturan Keamanan Medis:</strong> 1 Akun hanya dapat login pada 1 perangkat/browser. Peran akun terikat permanen dan tidak dapat ditukar saat sesi berlangsung.
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Email */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Pengguna:</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@visionmed.hospital"
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#0284c7]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password:</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-slate-800 font-medium focus:outline-hidden focus:ring-2 focus:ring-[#0284c7]"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold py-2.5 rounded-lg transition shadow-md flex items-center justify-center gap-2 text-xs disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Memverifikasi...' : 'Masuk ke Sistem'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Select Hospital Accounts for Demo Evaluation */}
          <div className="mt-6 pt-5 border-t border-gray-200">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-2 text-center">
              Pilih Akun Rumah Sakit Terdaftar (Default Password: hospital123)
            </span>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSelectAccount('reed.security@visionmed.hospital')}
                className={`w-full p-2.5 rounded-lg border text-left transition flex items-center justify-between text-xs ${
                  email === 'reed.security@visionmed.hospital'
                    ? 'border-red-500 bg-red-50/80 ring-1 ring-red-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">👮</span>
                  <div>
                    <div className="font-bold text-slate-900">Officer Reed (Role: Security)</div>
                    <div className="text-[10px] text-slate-500">reed.security@visionmed.hospital</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-red-600">Gunakan &rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAccount('sarah.reception@visionmed.hospital')}
                className={`w-full p-2.5 rounded-lg border text-left transition flex items-center justify-between text-xs ${
                  email === 'sarah.reception@visionmed.hospital'
                    ? 'border-sky-500 bg-sky-50/80 ring-1 ring-sky-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">👩‍⚕️</span>
                  <div>
                    <div className="font-bold text-slate-900">Sarah Jenkins (Role: Receptionist)</div>
                    <div className="text-[10px] text-slate-500">sarah.reception@visionmed.hospital</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-sky-600">Gunakan &rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAccount('admin@visionmed.hospital')}
                className={`w-full p-2.5 rounded-lg border text-left transition flex items-center justify-between text-xs ${
                  email === 'admin@visionmed.hospital'
                    ? 'border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-400'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">👨‍💼</span>
                  <div>
                    <div className="font-bold text-slate-900">Dr. Aris Thorne (Role: Admin)</div>
                    <div className="text-[10px] text-slate-500">admin@visionmed.hospital</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600">Gunakan &rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
