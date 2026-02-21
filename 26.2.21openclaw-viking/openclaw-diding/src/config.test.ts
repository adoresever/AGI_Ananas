/**
 * Property-Based Tests for DingTalk Config Schema
 * 
 * Feature: dingtalk-integration
 * Property 1: 配置 Schema 验证
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { DingtalkConfigSchema, isConfigured, resolveDingtalkCredentials } from "./config.js";

describe("Feature: dingtalk-integration, Property 1: 配置 Schema 验证", () => {
  /**
   * Property: For any valid DingTalk config object, Zod schema parsing should succeed
   * and return a config with all required default values.
   */
  it("should parse valid configs and apply defaults", () => {
    // Arbitrary for valid config objects
    const validConfigArb = fc.record({
      enabled: fc.option(fc.boolean(), { nil: undefined }),
      clientId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      clientSecret: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      dmPolicy: fc.option(fc.constantFrom("open", "pairing", "allowlist"), { nil: undefined }),
      groupPolicy: fc.option(fc.constantFrom("open", "allowlist", "disabled"), { nil: undefined }),
      requireMention: fc.option(fc.boolean(), { nil: undefined }),
      allowFrom: fc.option(fc.array(fc.string()), { nil: undefined }),
      groupAllowFrom: fc.option(fc.array(fc.string()), { nil: undefined }),
      historyLimit: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
      textChunkLimit: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: undefined }),
    });

    fc.assert(
      fc.property(validConfigArb, (config) => {
        const result = DingtalkConfigSchema.safeParse(config);
        
        // Schema should parse successfully
        expect(result.success).toBe(true);
        
        if (result.success) {
          // Default values should be applied
          expect(typeof result.data.enabled).toBe("boolean");
          expect(typeof result.data.dmPolicy).toBe("string");
          expect(typeof result.data.groupPolicy).toBe("string");
          expect(typeof result.data.requireMention).toBe("boolean");
          expect(typeof result.data.historyLimit).toBe("number");
          expect(typeof result.data.textChunkLimit).toBe("number");
          
          // Verify default values when not provided
          if (config.enabled === undefined) {
            expect(result.data.enabled).toBe(true);
          }
          if (config.dmPolicy === undefined) {
            expect(result.data.dmPolicy).toBe("pairing");
          }
          if (config.groupPolicy === undefined) {
            expect(result.data.groupPolicy).toBe("allowlist");
          }
          if (config.requireMention === undefined) {
            expect(result.data.requireMention).toBe(true);
          }
          if (config.historyLimit === undefined) {
            expect(result.data.historyLimit).toBe(10);
          }
          if (config.textChunkLimit === undefined) {
            expect(result.data.textChunkLimit).toBe(4000);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any config missing clientId or clientSecret,
   * isConfigured function should return false.
   */
  it("should return false for isConfigured when credentials are missing", () => {
    // Arbitrary for configs with missing credentials
    const missingCredentialsArb = fc.oneof(
      // Missing clientId
      fc.record({
        enabled: fc.option(fc.boolean(), { nil: undefined }),
        clientId: fc.constant(undefined),
        clientSecret: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
      }),
      // Missing clientSecret
      fc.record({
        enabled: fc.option(fc.boolean(), { nil: undefined }),
        clientId: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        clientSecret: fc.constant(undefined),
      }),
      // Both missing
      fc.record({
        enabled: fc.option(fc.boolean(), { nil: undefined }),
        clientId: fc.constant(undefined),
        clientSecret: fc.constant(undefined),
      }),
      // Empty strings
      fc.record({
        enabled: fc.option(fc.boolean(), { nil: undefined }),
        clientId: fc.constant(""),
        clientSecret: fc.string({ minLength: 1 }),
      }),
      fc.record({
        enabled: fc.option(fc.boolean(), { nil: undefined }),
        clientId: fc.string({ minLength: 1 }),
        clientSecret: fc.constant(""),
      })
    );

    fc.assert(
      fc.property(missingCredentialsArb, (config) => {
        const parsed = DingtalkConfigSchema.safeParse(config);
        if (parsed.success) {
          expect(isConfigured(parsed.data)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any config with both clientId and clientSecret present,
   * isConfigured should return true and resolveDingtalkCredentials should return credentials.
   */
  it("should return true for isConfigured when credentials are present", () => {
    const configWithCredentialsArb = fc.record({
      enabled: fc.option(fc.boolean(), { nil: undefined }),
      clientId: fc.string({ minLength: 1 }),
      clientSecret: fc.string({ minLength: 1 }),
      dmPolicy: fc.option(fc.constantFrom("open", "pairing", "allowlist"), { nil: undefined }),
      groupPolicy: fc.option(fc.constantFrom("open", "allowlist", "disabled"), { nil: undefined }),
    });

    fc.assert(
      fc.property(configWithCredentialsArb, (config) => {
        const parsed = DingtalkConfigSchema.safeParse(config);
        expect(parsed.success).toBe(true);
        
        if (parsed.success) {
          expect(isConfigured(parsed.data)).toBe(true);
          
          const credentials = resolveDingtalkCredentials(parsed.data);
          expect(credentials).toBeDefined();
          expect(credentials?.clientId).toBe(config.clientId);
          expect(credentials?.clientSecret).toBe(config.clientSecret);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Schema should reject invalid policy values
   */
  it("should reject invalid policy values", () => {
    const invalidPolicyArb = fc.record({
      dmPolicy: fc.string().filter(s => !["open", "pairing", "allowlist"].includes(s)),
    });

    fc.assert(
      fc.property(invalidPolicyArb, (config) => {
        const result = DingtalkConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: historyLimit should reject negative values
   */
  it("should reject negative historyLimit values", () => {
    const negativeHistoryArb = fc.record({
      historyLimit: fc.integer({ max: -1 }),
    });

    fc.assert(
      fc.property(negativeHistoryArb, (config) => {
        const result = DingtalkConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: textChunkLimit should reject non-positive values
   */
  it("should reject non-positive textChunkLimit values", () => {
    const nonPositiveChunkArb = fc.record({
      textChunkLimit: fc.integer({ max: 0 }),
    });

    fc.assert(
      fc.property(nonPositiveChunkArb, (config) => {
        const result = DingtalkConfigSchema.safeParse(config);
        expect(result.success).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});
