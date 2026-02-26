"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { PhoneInput } from "@/components/PhoneInput";
import Button from "@/components/Button";

// Import your placeholder image
import UserProfile from "@/assets/images/user.png"; 

const PRESET_AMOUNTS = [5, 10, 50, 100, 200, 500];
const MAX_MESSAGE_LENGTH = 200;

export default function SendGiftDetailsForm() {
  // Recipient State
  const [countryCode, setCountryCode] = useState("+234");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [recipient, setRecipient] = useState<{ name: string; username: string; avatar: any } | null>(null);

  // Amount State
  const [amount, setAmount] = useState<string>("");

  // Delivery Date & Time State
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [dateTimeError, setDateTimeError] = useState("");

  // Options State
  const [hideAmount, setHideAmount] = useState(false);
  const [message, setMessage] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  // 1. Mock Recipient Lookup Logic
  useEffect(() => {
    const cleanedPhone = phoneNumber.replace(/\D/g, "");
    // Simulate lookup completion after entering a valid length number
    if (cleanedPhone.length >= 10) {
      setRecipient({
        name: "Julaybeeb Abubakar",
        username: "@julaybeeb",
        avatar: UserProfile,
      });
    } else {
      setRecipient(null);
    }
  }, [phoneNumber]);

  // 2. Future Date/Time Validation
  useEffect(() => {
    if (date && time) {
      const selectedDateTime = new Date(`${date}T${time}`);
      const now = new Date();
      if (selectedDateTime <= now) {
        setDateTimeError("Delivery time must be in the future");
      } else {
        setDateTimeError("");
      }
    } else {
      setDateTimeError("");
    }
  }, [date, time]);

  // 3. Validation for the Continue Button
  const isFormValid =
    recipient !== null &&
    amount !== "" &&
    Number(amount) > 0 &&
    !dateTimeError;

  const handleContinue = () => {
    setIsLoading(true);
    // Simulate API/Routing delay
    setTimeout(() => {
      setIsLoading(false);
      alert("Validation passed! Ready to proceed to the Review screen.");
    }, 1000);
  };

  return (
    <div className="w-full flex justify-center px-4 py-6 md:py-10">
      <div className="w-full max-w-[400px] rounded-3xl bg-[#FAFAFB] border border-[#EEEEF3] p-5 md:p-6 shadow-sm">
        <h2 className="text-[24px] md:text-[28px] font-semibold text-[#18181B]">
          Send a Gift
        </h2>
        <p className="text-[13px] text-[#717182] mt-1.5 mb-6">
          Enter recipient details and amount to send a gift.
        </p>

        <div className="space-y-5">
          {/* Recipient Phone Input */}
          <div>
            <PhoneInput
              label="Recipient Phone Number"
              placeholder="e.g. 812 345 6789"
              countryCode={countryCode}
              onCountryCodeChange={setCountryCode}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            
            {/* Contact Card (Renders when recipient is found) */}
            {recipient && (
              <div className="mt-3 flex items-center gap-3 p-3 bg-white border border-[#E5E7EB] rounded-xl shadow-sm transition-all animate-in fade-in slide-in-from-top-2">
                <Image
                  src={recipient.avatar}
                  alt="Recipient avatar"
                  width={40}
                  height={40}
                  className="rounded-full object-cover border border-[#EEEEF3]"
                />
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold text-[#18181B] leading-none">
                    {recipient.name}
                  </span>
                  <span className="text-[12px] text-[#717182] mt-1">
                    {recipient.username}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Amount Selection */}
          <div>
            <label className="block text-xs text-[#9CA3AF] mb-2 px-1">Gift Amount (USD)</label>
            
            {/* Custom Amount Input */}
            <div className="relative flex items-center mb-3">
              <span className="absolute left-4 text-[#18181B] font-medium text-lg">$</span>
              <input
                type="number"
                min="1"
                placeholder="Enter custom amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-3 rounded-lg bg-white border border-[#E5E7EB] text-[#030213] placeholder:text-[#C6C7CF] focus:outline-none focus:ring-2 focus:ring-[#5A42DE]/20 focus:border-[#5A42DE] transition-all"
              />
            </div>

            {/* Preset Amount Grid */}
            <div className="grid grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                    amount === String(preset)
                      ? "bg-[#F1EDFF] border-[#5A42DE] text-[#5A42DE]"
                      : "bg-white border-[#E5E7EB] text-[#717182] hover:bg-gray-50"
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Date & Time */}
          <div>
            <label className="block text-xs text-[#9CA3AF] mb-2 px-1">Delivery Date & Time (Optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#E5E7EB] text-sm text-[#030213] focus:outline-none focus:ring-2 focus:ring-[#5A42DE]/20 focus:border-[#5A42DE]"
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white border border-[#E5E7EB] text-sm text-[#030213] focus:outline-none focus:ring-2 focus:ring-[#5A42DE]/20 focus:border-[#5A42DE]"
              />
            </div>
            {dateTimeError && (
              <p className="mt-1.5 text-[12px] text-red-500">{dateTimeError}</p>
            )}
          </div>

          {/* Hide Amount Toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="hideAmount"
              checked={hideAmount}
              onChange={(e) => setHideAmount(e.target.checked)}
              className="size-4 rounded border-gray-300 text-[#5A42DE] focus:ring-[#5A42DE]"
            />
            <label htmlFor="hideAmount" className="text-[13px] text-[#18181B] cursor-pointer select-none">
              Hide amount from Recipient
            </label>
          </div>

          {/* Message Textarea */}
          <div>
            <div className="flex justify-between items-end mb-2 px-1">
              <label className="block text-xs text-[#9CA3AF]">Message / Note (Optional)</label>
              <span className={`text-[10px] ${message.length >= MAX_MESSAGE_LENGTH ? 'text-red-500' : 'text-[#717182]'}`}>
                {message.length}/{MAX_MESSAGE_LENGTH}
              </span>
            </div>
            <textarea
              maxLength={MAX_MESSAGE_LENGTH}
              rows={3}
              placeholder="Write a sweet note..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-white border border-[#E5E7EB] text-sm text-[#030213] placeholder:text-[#C6C7CF] focus:outline-none focus:ring-2 focus:ring-[#5A42DE]/20 focus:border-[#5A42DE] resize-none"
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleContinue}
            disabled={!isFormValid || isLoading}
            isLoading={isLoading}
            className="w-full h-12 mt-2 rounded-xl bg-[#5A42DE] hover:bg-[#4E37CC] text-white text-[15px] font-semibold transition-all duration-200 disabled:opacity-50"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}