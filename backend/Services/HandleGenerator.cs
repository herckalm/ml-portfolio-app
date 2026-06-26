using System.Text.RegularExpressions;

namespace MlPortfolio.Api.Services;

/// <summary>
/// Pure helper for turning arbitrary text into a valid, safe public handle and
/// for screening reserved words. Stateless and static; the uniqueness check lives
/// in the auth service (it needs the repository), this type only handles shape
/// and the reserved set.
/// </summary>
public static partial class HandleGenerator
{
    // Handles that must never be assigned — they collide with routes or are
    // confusing/abusable as a public identity. Case-insensitive set.
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "admin", "administrator", "root", "system", "support", "help", "about",
        "contact", "terms", "privacy", "api", "app", "auth", "login", "logout",
        "register", "signup", "signin", "settings", "dashboard", "me", "user",
        "users", "u", "profile", "profiles", "public", "static", "assets",
        "new", "edit", "delete", "null", "undefined"
    };

    // Source-generated regex (compiled at build time): any run of non-slug chars.
    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugRun();

    /// <summary>
    /// Lowercases input, collapses every run of non-<c>[a-z0-9]</c> characters to a
    /// single hyphen, and trims leading/trailing hyphens. Returns null when the
    /// input is blank or reduces to nothing (e.g. all-symbol input), so callers can
    /// fall back to a default.
    /// </summary>
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var slug = NonSlugRun()
            .Replace(input.Trim().ToLowerInvariant(), "-")
            .Trim('-');

        return string.IsNullOrEmpty(slug) ? null : slug;
    }

    /// <summary>True if the handle is on the reserved list (case-insensitive).</summary>
    public static bool IsReserved(string handle) => Reserved.Contains(handle);
}