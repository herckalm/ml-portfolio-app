# Stage 1 — build & publish

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy ONLY the project file first, then restore.
# This layer is cached and only re-runs when the .csproj changes —
# editing C# source won't bust the (slow) NuGet restore.
COPY MlPortfolio.Api.csproj ./
RUN dotnet restore MlPortfolio.Api.csproj

# Now bring in the rest of the source and publish a Release build.
COPY . .
RUN dotnet publish MlPortfolio.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

# EF migration bundle for Fly's release_command
# Produces a self-contained executable that applies migrations using only the
# .NET runtime (no SDK) — copied into the runtime image below.
# The dummy Jwt__*/ConnectionStrings values exist ONLY so EF design-time
# host-building succeeds while GENERATING the bundle (your Program.cs validates
# Jwt__* and needs a non-null connection string to construct the DbContext).
# They are confined to THIS build stage and never reach the runtime image;
# real values arrive as Fly secrets at release time. Generation never touches
# a database.
RUN dotnet tool install --global dotnet-ef --version 10.0.8
ENV PATH="$PATH:/root/.dotnet/tools"
ENV ConnectionStrings__DefaultConnection="Host=localhost;Database=build;Username=build;Password=build"
ENV Jwt__Secret="build-time-only-dummy-secret-padded-past-32-bytes"
ENV Jwt__Issuer="build"
ENV Jwt__Audience="build"
RUN dotnet ef migrations bundle \
    --project MlPortfolio.Api.csproj \
    --configuration Release \
    --output /app/efbundle \
    --force

# Stage 2 — runtime (slim ASP.NET image, no SDK)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Installed as root, BEFORE we drop privileges below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Copy just the published output from the build stage
COPY --from=build /app/publish ./

# Carry the migration bundle (root-owned); make it runnable by the non-root user.
COPY --from=build /app/efbundle ./efbundle
RUN chmod +x ./efbundle

# Be explicit so it's self-documenting.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# Run as the non-root user baked into the official image ($APP_UID).
USER $APP_UID

# Self-contained liveness check against the /health endpoint in your Program.cs.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD curl --fail http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "MlPortfolio.Api.dll"]

# Stage 3 — migrator: apply EF Core migrations, then exit
FROM build AS migrator
# dotnet-ef pinned to match EF Core Design package (10.0.8) for reproducibility.
RUN dotnet tool install --global dotnet-ef --version 10.0.8
ENV PATH="$PATH:/root/.dotnet/tools"
WORKDIR /src
ENTRYPOINT ["dotnet", "ef", "database", "update", "--project", "MlPortfolio.Api.csproj"]