//
//  DateFormatting.swift
//  ClipKitCore
//
//  Utilities for formatting dates and timestamps
//

import Foundation

public enum DateFormatting {
    /// Format a date as a relative string (e.g., "2 hrs ago", "3 days ago")
    public static func relativeString(from date: Date) -> String {
        let calendar = Calendar.current
        let now = Date()
        let components = calendar.dateComponents([.second, .minute, .hour, .day, .weekOfYear], from: date, to: now)

        if let weeks = components.weekOfYear, weeks > 0 {
            return weeks == 1 ? "1 week ago" : "\(weeks) weeks ago"
        } else if let days = components.day, days > 0 {
            return days == 1 ? "1 day ago" : "\(days) days ago"
        } else if let hours = components.hour, hours > 0 {
            return hours == 1 ? "1 hr ago" : "\(hours) hrs ago"
        } else if let minutes = components.minute, minutes > 0 {
            return minutes == 1 ? "1 min ago" : "\(minutes) mins ago"
        } else {
            return "Just now"
        }
    }

    /// Format expiration info (e.g., "Expires in 3 days", "Expired 2 days ago")
    public static func expirationString(from expirationDate: Date) -> String {
        let now = Date()

        if expirationDate < now {
            // Already expired
            let timeAgo = relativeString(from: expirationDate)
            return "Expired \(timeAgo)"
        } else {
            // Future expiration
            let calendar = Calendar.current
            let components = calendar.dateComponents([.day, .hour], from: now, to: expirationDate)

            if let days = components.day, days > 0 {
                return days == 1 ? "Expires in 1 day" : "Expires in \(days) days"
            } else if let hours = components.hour, hours > 0 {
                return hours == 1 ? "Expires in 1 hour" : "Expires in \(hours) hours"
            } else {
                return "Expires soon"
            }
        }
    }

    /// Format days remaining in compact form (e.g., "3d left")
    public static func compactDaysRemaining(until expirationDate: Date) -> String? {
        let now = Date()
        guard expirationDate > now else { return nil }

        let calendar = Calendar.current
        let components = calendar.dateComponents([.day, .hour], from: now, to: expirationDate)

        if let days = components.day, days > 0 {
            return "\(days)d left"
        } else if let hours = components.hour, hours > 0 {
            return "\(hours)h left"
        } else {
            return "<1h left"
        }
    }
}
