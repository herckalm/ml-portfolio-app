using System.Text.RegularExpressions;

namespace MlPortfolio.Api.Services;

public static partial class HandleGenerator
{
    // handles that must never be assigned — they collide with routes or are
    // confusing/abusable as a public identity. Case-insensitive set.
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "admin", "administrator", "root", "system", "support", "help", "about",
        "contact", "terms", "privacy", "api", "app", "auth", "login", "logout",
        "register", "signup", "signin", "settings", "dashboard", "me", "user",
        "users", "u", "profile", "profiles", "public", "static", "assets",
        "new", "edit", "delete", "null", "undefined"
    };

    // source-generated regex (compiled at build time): any run of non-slug chars.
    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlugRun();

    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var slug = NonSlugRun()
            .Replace(input.Trim().ToLowerInvariant(), "-")
            .Trim('-');

        return string.IsNullOrEmpty(slug) ? null : slug;
    }

    public static bool IsReserved(string handle) => Reserved.Contains(handle);
}